import type { BundleCost } from '../engine/bundles.js';
import { cardsFrom, type CardSet } from '../orchestrator/cards.js';
import type { Session, Source } from '../types.js';
import { ToolBudget } from './budget.js';
import { pickCombos, type Combo, type RankedPromo } from './combine.js';
import { newRun, runAgent, type AgentRun } from './runAgent.js';
import { AGENT_NAMES, AGENT_SPECS, allocateQuotas, type AgentName } from './specs.js';

export const MAX_AGENTS = 3;
export const AGENT_TIMEOUT_MS = 15000;

export type AgentTask = { agent: string; task: string };
export type AgentFixtures = { agent_timeouts?: string[]; timeout_ms?: number };
export type Emit = (event: string, data: unknown) => void;

export type DispatchOutcome = {
  runs: AgentRun[];
  /** 專員實際發出的工具呼叫（計入每輪 6 次上限） */
  tool_calls: number;
  tools: string[];
  sources: Source[];
  cards: CardSet | null;
  combos: Combo[];
  need_verify: boolean;
  /** 交回主控模型的精簡結果 */
  payload: unknown;
};

const MISSING: Record<AgentName, string> = {
  promo: '優惠推薦',
  product: '商品與優惠價',
  order: '訂單與會員資料',
  knowledge: '最新活動與規定',
};

/** 驗證派工內容：只收 4 種專員、同種合併、最多 MAX_AGENTS 個 */
export function normalizeTasks(tasks: unknown, alreadyUsed: number, maxAgents = MAX_AGENTS): { ok: AgentTask[]; rejected: string[] } {
  const list = Array.isArray(tasks) ? tasks : [];
  const merged = new Map<AgentName, string>();
  const rejected: string[] = [];
  for (const t of list as any[]) {
    const a = String(t?.agent ?? '') as AgentName;
    const task = String(t?.task ?? '').trim();
    if (!AGENT_NAMES.includes(a) || !task) {
      rejected.push(String(t?.agent ?? '?'));
      continue;
    }
    if (merged.has(a)) merged.set(a, merged.get(a) + '；' + task);
    else if (merged.size + alreadyUsed < Math.min(MAX_AGENTS, maxAgents)) merged.set(a, task);
    else rejected.push(a);
  }
  return { ok: [...merged].map(([agent, task]) => ({ agent, task })), rejected };
}

const hang = (signal: AbortSignal) => new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));

export async function dispatchAgents(
  tasks: AgentTask[],
  opts: { session: Session; remaining: number; emit: Emit; fixtures?: AgentFixtures; signal?: AbortSignal; timeoutMs?: number },
): Promise<DispatchOutcome> {
  const names = tasks.map((t) => t.agent as AgentName);
  const quotas = allocateQuotas(names, opts.remaining);
  const budget = new ToolBudget(quotas);
  const timeoutMs = opts.fixtures?.timeout_ms ?? opts.timeoutMs ?? AGENT_TIMEOUT_MS;
  const forcedTimeouts = new Set(opts.fixtures?.agent_timeouts ?? []);

  // 同時派商品專員時，優惠專員的推薦要和商品同一個通路，組合才對得上
  const withProduct = names.includes('product');
  const runs = tasks.map((t) =>
    newRun(t.agent as AgentName, t.agent === 'promo' && withProduct ? t.task + '（用戶同時在挑商品，recommend_promos 請依任務中的預算與分類帶 manual_basket）' : t.task),
  );

  await Promise.all(
    runs.map(async (run) => {
      const spec = AGENT_SPECS[run.agent];
      if (!quotas.get(run.agent)) {
        run.status = 'skipped';
        run.error = 'TOOL_LIMIT_REACHED';
        run.closed = true;
        opts.emit('status', { text: `${spec.label}：本輪工具額度已用完，略過`, agent: run.agent, phase: 'skipped' });
        return;
      }
      const started = Date.now();
      const controller = new AbortController();
      const onParentAbort = () => controller.abort();
      opts.signal?.addEventListener('abort', onParentAbort, { once: true });
      opts.emit('status', { text: spec.status, agent: run.agent, phase: 'start' });

      let timer: NodeJS.Timeout | undefined;
      const timeout = new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), timeoutMs);
      });
      const work = (forcedTimeouts.has(run.agent) ? hang(controller.signal) : runAgent(run, opts.session, budget, controller.signal)).then(
        () => 'done' as const,
        (e: Error) => {
          if (!run.closed) run.error = e?.message ?? String(e);
          return 'error' as const;
        },
      );
      const outcome = await Promise.race([work, timeout]);
      clearTimeout(timer);
      run.closed = true;
      run.status = outcome;
      run.ms = Date.now() - started;
      controller.abort();
      opts.signal?.removeEventListener('abort', onParentAbort);
      budget.release(run.agent);

      if (outcome === 'done') opts.emit('status', { text: `${spec.label}：完成`, agent: run.agent, phase: 'done' });
      else if (outcome === 'timeout')
        opts.emit('status', { text: `${spec.label}：超過 ${Math.round(timeoutMs / 1000)} 秒，先用已取得的結果回答`, agent: run.agent, phase: 'timeout' });
      else opts.emit('status', { text: `${spec.label}：查詢失敗，先用已取得的結果回答`, agent: run.agent, phase: 'error' });
    }),
  );

  // 來源與卡片只取逾時前已完成的工具結果
  const sources: Source[] = [];
  const seen = new Set<string>();
  const cardSets: CardSet[] = [];
  let needVerify = false;
  const bundleOptions: BundleCost[] = [];
  let productOrder: string[] = [];
  let promoOrder: RankedPromo[] = [];
  for (const run of runs) {
    for (const c of run.calls) {
      for (const s of c.result.sources ?? []) {
        const key = s.url + '|' + (s.cited_text ?? '');
        if (!seen.has(key)) {
          seen.add(key);
          sources.push(s);
        }
      }
      if (!c.result.ok) {
        if (c.result.error === 'NEED_VERIFY' || c.result.error === 'NEED_VERIFY_OR_MANUAL_BASKET') needVerify = true;
        continue;
      }
      const d = c.result.data as any;
      const cs = cardsFrom(c.tool, c.result);
      if (cs) cardSets.push(cs);
      if (c.tool === 'get_promo_price') bundleOptions.push(...(d?.options ?? []));
      if (c.tool === 'recommend_products') productOrder = (d?.items ?? []).map((x: any) => x.product.id);
      if (c.tool === 'recommend_promos') promoOrder = (d?.items ?? []).map((x: any) => ({ id: x.promo.id }));
    }
  }

  const combos = bundleOptions.length ? pickCombos(bundleOptions, productOrder, promoOrder, 3) : [];
  let cards: CardSet | null = null;
  if (combos.length) {
    const base = cardsFrom('get_promo_price', { ok: true, data: { options: combos } });
    if (base) cards = { type: 'bundle', items: base.items.map((it: any, i) => ({ ...it, reason: combos[i].reason })) };
  } else {
    for (const type of ['bundle', 'promo', 'product', 'order'] as const) {
      const found = cardSets.find((c) => c.type === type);
      if (found) {
        cards = found;
        break;
      }
    }
  }

  const missing = runs.filter((r) => r.status !== 'done').map((r) => MISSING[r.agent]);
  const payload = {
    combos: combos.map((c, i) => ({
      no: i + 1,
      label: `${c.product.name}＋${c.promo.name}（${c.channel_label}）`,
      bundle_id: c.bundle_id,
      product: c.product.name,
      promo: c.promo.name,
      promo_id: c.promo.id,
      requirement: c.promo.requirement_label,
      list_price: c.list_price,
      bundle_price: c.bundle_price,
      saving: c.saving,
      gift: c.gift,
      reason: c.reason,
      mock: c.mock,
    })),
    missing,
    agents: runs.map((r) => ({
      agent: r.agent,
      label: r.label,
      status: r.status,
      error: r.error,
      // 有 combos 時不再給原始優惠價報價與商品專員摘要，避免主控混用其他組合的價格
      summary: combos.length && r.agent === 'product' ? '' : r.summary,
      results: r.calls.map((c) => ({
        tool: c.tool,
        ok: c.result.ok,
        error: c.result.error,
        data: combos.length && c.tool === 'get_promo_price' ? '已整合進 combos' : JSON.stringify(c.result.data ?? null).slice(0, 2500),
      })),
    })),
    note: combos.length
      ? 'combos 是唯一可以介紹的商品＋優惠組合，畫面會依同樣順序顯示卡片。請依 no 的順序逐組照抄 label、list_price、bundle_price、saving，不可改名、改數字、重新排序，也不可自行加總或計算合計金額。'
      : '沒有可組合的優惠價報價，請依各專員結果回答。',
  };

  return {
    runs,
    tool_calls: budget.total,
    tools: budget.log.map((l) => l.tool),
    sources,
    cards,
    combos,
    need_verify: needVerify,
    payload,
  };
}
