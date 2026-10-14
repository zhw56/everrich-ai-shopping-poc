/**
 * T10 評測：npm run eval
 *   預設跑 data/eval.json 全部 30 題（規則檢查決定通過與否，AI 評分員只列參考）
 *   --only S7-01,S2      只跑指定題號或情境
 *   --no-judge           不呼叫 AI 評分員
 *   --concurrency 3      同時跑幾題（預設 3）
 *   --demo [--repeat 3]  展示情境 S1、S2、S4、S7、S10 的多輪流程，各連跑 N 次
 * 報告寫到 eval-results/latest.json 與 latest.md（--demo 為 demo-latest.*）；用 Inception 時檔名加 -inception，不覆蓋 Claude 的結果
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { activeProvider, apiKeyFor, getLlm, modelFor, PROVIDER_LABEL } from '../src/llm/index.js';

/** Inception 測試結果另存，不覆蓋 Claude 的正式評測報告 */
const SUFFIX = activeProvider() === 'inception' ? '-inception' : '';
import { DATA_DIR, loadKb, loadSources } from '../src/data.js';
import { getState, resetState, runTurn, verifyAndResume, type TurnFixtures, type TurnMeta } from '../src/orchestrator/index.js';

const NL = String.fromCharCode(10);
const OUT_DIR = fileURLToPath(new URL('../../eval-results/', import.meta.url));
const argv = process.argv.slice(2);
const flag = (k: string) => argv.includes(k);
const opt = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };

type EvalItem = {
  id: string; scenario: string; question: string;
  initial_session: { verified: boolean; user_id: string | null };
  expected_tools: string[]; forbidden_tools: string[]; expected_actions: string[]; alt_actions?: string[];
  expected_agents?: string[]; expected_answer_points: string[];
  must_include_sources: boolean; must_disclose_mock: boolean; max_tool_calls: number; max_agents: number;
  fixtures?: Record<string, unknown>;
};
type Capture = { answer: string; actions: any[]; cards: any; sources: any[]; statuses: any[]; meta: TurnMeta | null; error: string | null; ms: number };
type Check = { name: string; ok: boolean; detail?: string };

const SIMPLIFIED = /[个价机这们说么没对会还发时实现话经过让给从头动]/;
const MOCK_NOTICE = /(展示|模擬|假資料|以昇恆昌(官網)?公告為準)/;
/** 已驗證時 recommend_promos／recommend_products 會自行讀取會員等級、航班與消費紀錄，視同已讀會員資料 */
const EQUIVALENT: Record<string, string[]> = {
  get_user_profile: ['recommend_promos', 'recommend_products', 'get_order', 'get_purchases'],
  get_purchases: ['recommend_promos'],
  query_products: ['recommend_products'],
  recommend_products: ['query_products'],
  query_promos: ['recommend_promos'],
};

async function turn(sessionId: string, message: string, fixtures?: TurnFixtures): Promise<Capture> {
  const cap: Capture = { answer: '', actions: [], cards: null, sources: [], statuses: [], meta: null, error: null, ms: 0 };
  const t0 = Date.now();
  try {
    await runTurn(sessionId, message, (ev, data: any) => {
      if (ev === 'delta') cap.answer += data.text;
      else if (ev === 'action') cap.actions.push(data);
      else if (ev === 'cards') cap.cards = data;
      else if (ev === 'sources') cap.sources = data;
      else if (ev === 'status') cap.statuses.push(data);
      else if (ev === 'done') cap.meta = data.meta;
      else if (ev === 'error') cap.error = data.message;
    }, { fixtures });
  } catch (e) {
    cap.error = (e as Error).message;
  }
  cap.ms = Date.now() - t0;
  return cap;
}

/** eval.json 的 fixtures 轉成 runTurn 的覆寫（不修改正式資料） */
export function toFixtures(f: Record<string, any> = {}): TurnFixtures {
  const out: TurnFixtures = {};
  const tools: NonNullable<TurnFixtures['tools']> = {};
  if (f.sources_enabled === false) tools.sources = loadSources().map((s) => ({ ...s, enabled: false }));
  if (f.kb_empty) tools.kb = [];
  else if (typeof f.kb_last_checked === 'string') tools.kb = loadKb().map((k) => ({ ...k, last_checked: f.kb_last_checked }));
  if (Object.keys(tools).length) out.tools = tools;
  if (Array.isArray(f.agent_timeouts)) out.agent_timeouts = f.agent_timeouts;
  if (typeof f.timeout_ms === 'number') out.timeout_ms = f.timeout_ms;
  if (typeof f.consecutive_unanswered === 'number') out.consecutive_unanswered = f.consecutive_unanswered;
  return out;
}

export function gradeItem(q: EvalItem, c: Capture): Check[] {
  const checks: Check[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail: ok ? undefined : detail });
  const used = c.meta?.tools ?? [];
  const actions = c.actions.map((a) => a.type);
  add('正常結束', !c.error && !!c.meta, c.error ?? '沒有 done meta');
  const missing = q.expected_tools.filter((t) => !used.includes(t) && !(EQUIVALENT[t] ?? []).some((e) => used.includes(e)));
  add('使用預期工具', missing.length === 0, `缺少：${missing.join('、')}（實際：${used.join('、') || '無'}）`);
  if (q.forbidden_tools.includes('*')) add('不呼叫任何工具', (c.meta?.tool_calls ?? 0) === 0 && used.length === 0, `實際：${used.join('、')}`);
  else {
    const bad = q.forbidden_tools.filter((t) => used.includes(t));
    add('未使用禁用工具', bad.length === 0, `違規：${bad.join('、')}`);
  }
  const missAct = q.expected_actions.filter((a) => !actions.includes(a) && !(q.alt_actions ?? []).some((x) => actions.includes(x)));
  add('出現預期畫面動作', missAct.length === 0, `缺少：${missAct.join('、')}（實際：${actions.join('、') || '無'}）`);
  if (q.must_include_sources) add('附來源', c.sources.length > 0, '沒有任何來源');
  if (q.must_disclose_mock) add('揭露展示資料', MOCK_NOTICE.test(c.answer) || c.actions.some((a) => a.payload?.mock === true), '回答沒有提到展示／模擬資料');
  add(`工具呼叫 ≤ ${q.max_tool_calls}`, (c.meta?.tool_calls ?? 99) <= q.max_tool_calls, `實際 ${c.meta?.tool_calls}`);
  add(`專員 ≤ ${q.max_agents}`, (c.meta?.agents.length ?? 99) <= q.max_agents, `實際 ${c.meta?.agents.join('、')}`);
  if (Array.isArray(q.expected_agents)) {
    const got = [...(c.meta?.agents ?? [])].sort().join(',');
    add('派出預期專員', got === [...q.expected_agents].sort().join(','), `預期 ${q.expected_agents.join('、') || '不派工'}，實際 ${got || '不派工'}`);
  }
  add('沒有簡體字', !SIMPLIFIED.test(c.answer), c.answer.match(SIMPLIFIED)?.[0]);
  return checks;
}

async function judgePoints(q: EvalItem, c: Capture): Promise<{ point: string; met: boolean | null; reason: string }[] | null> {
  if (flag('--no-judge') || !apiKeyFor() || !modelFor('agent')) return null;
  const judge = getLlm();
  const facts = { tools: c.meta?.tools, agents: c.meta?.agents, agent_status: c.meta?.agent_status, guard: (c.meta as any)?.guard ?? null, actions: c.actions.map((a) => ({ type: a.type, payload: a.payload })), cards: c.cards ? { type: c.cards.type, count: c.cards.items?.length } : null, source_count: c.sources.length };
  try {
    const res: any = await judge.messages.create({
      model: modelFor('agent'),
      max_tokens: 800,
      system: '你是客服回答的評分員。依「答案重點」逐條判斷客服回答（含畫面動作與工具紀錄）是否做到。有些重點描述的是系統行為（例如有沒有查官網、派了哪些專員），請依「畫面與工具」紀錄判斷，不要求回答文字提到。只輸出 JSON 陣列：[{"point":"…","met":true或false,"reason":"20 字內"}]，不要其他文字。',
      messages: [{ role: 'user', content: `問題：${q.question}${NL}答案重點：${JSON.stringify(q.expected_answer_points)}${NL}客服回答：${c.answer || '（無文字）'}${NL}畫面與工具：${JSON.stringify(facts)}` }],
    });
    const text = (res.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
    const arr = JSON.parse(text.slice(text.indexOf('['), text.lastIndexOf(']') + 1));
    return Array.isArray(arr) ? arr.map((x: any) => ({ point: String(x.point ?? ''), met: typeof x.met === 'boolean' ? x.met : null, reason: String(x.reason ?? '') })) : null;
  } catch (e) {
    return [{ point: '評分失敗', met: null, reason: (e as Error).message.slice(0, 80) }];
  }
}

async function pool<T, R>(items: T[], n: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

function setSession(id: string, s: EvalItem['initial_session']) {
  resetState(id);
  const st = getState(id);
  st.session.verified = s.verified;
  st.session.user_id = s.user_id;
}

const short = (s: string, n = 160) => (s.length > n ? s.slice(0, n) + '…' : s).split(NL).join(' ');

async function runEval() {
  const all: EvalItem[] = JSON.parse(readFileSync(DATA_DIR + 'eval.json', 'utf8'));
  const only = opt('--only')?.split(',').map((s) => s.trim()).filter(Boolean);
  const items = only ? all.filter((q) => only.some((o) => q.id === o || q.scenario === o)) : all;
  const conc = Number(opt('--concurrency') ?? 3);
  console.log(`評測 ${items.length} 題（同時 ${conc} 題）${flag('--no-judge') ? '，不使用 AI 評分員' : ''}`);
  const t0 = Date.now();
  const results = await pool(items, conc, async (q) => {
    const sid = `eval-${q.id}-${Date.now()}`;
    setSession(sid, q.initial_session);
    const c = await turn(sid, q.question, toFixtures(q.fixtures));
    const checks = gradeItem(q, c);
    const pass = checks.every((x) => x.ok);
    const judged = await judgePoints(q, c);
    resetState(sid);
    console.log(`${pass ? '✓' : '✗'} ${q.id} ${short(q.question, 30)}（${(c.ms / 1000).toFixed(1)} 秒）${pass ? '' : '：' + checks.filter((x) => !x.ok).map((x) => `${x.name}（${x.detail}）`).join('；')}`);
    return { id: q.id, scenario: q.scenario, question: q.question, pass, checks, judge: judged, answer: c.answer, tools: c.meta?.tools ?? [], actions: c.actions.map((a) => a.type), agents: c.meta?.agents ?? [], sources: c.sources.length, ms: c.ms, error: c.error, prompt_version: c.meta?.prompt_version ?? null };
  });
  const passed = results.filter((r) => r.pass).length;
  const rate = Math.round((passed / results.length) * 1000) / 10;
  const judgeMiss = results.filter((r) => r.judge?.some((p) => p.met === false));
  const summary = { at: new Date().toISOString(), total: results.length, passed, rate, minutes: Math.round((Date.now() - t0) / 600) / 100, prompt_version: (results.find((r) => r.prompt_version)?.prompt_version ?? null) as string | null, judge_flagged: judgeMiss.map((r) => r.id) };
  mkdirSync(OUT_DIR, { recursive: true });
  const tag = (only ? 'partial' : 'latest') + SUFFIX;
  writeFileSync(OUT_DIR + `${tag}.json`, JSON.stringify({ summary, results }, null, 2) + NL);
  const md = [
    `# 評測報告（${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })}）`, '',
    `- 通過 ${passed}／${results.length} 題，通過率 **${rate}%**（門檻 90%）`,
    `- 提示詞版本 ${summary.prompt_version ?? '未知'}；耗時 ${summary.minutes} 分鐘；通過與否只看規則檢查，AI 評分員意見僅供參考`, '',
    '## 失敗清單', '',
    ...(results.filter((r) => !r.pass).map((r) => `- **${r.id}** ${r.question}${NL}  - ${r.checks.filter((c) => !c.ok).map((c) => `${c.name}：${c.detail}`).join('；')}${NL}  - 回答：${short(r.answer)}`) || []),
    ...(results.every((r) => r.pass) ? ['（無）'] : []), '',
    '## AI 評分員提醒（不計入通過率）', '',
    ...(judgeMiss.length ? judgeMiss.map((r) => `- **${r.id}**：${r.judge!.filter((p) => p.met === false).map((p) => `${p.point}（${p.reason}）`).join('；')}`) : ['（無）']), '',
    '## 全部結果', '', '| 題號 | 結果 | 秒 | 工具 | 動作 | 專員 |', '| --- | --- | --- | --- | --- | --- |',
    ...results.map((r) => `| ${r.id} | ${r.pass ? '通過' : '失敗'} | ${(r.ms / 1000).toFixed(1)} | ${r.tools.join('、') || '—'} | ${r.actions.join('、') || '—'} | ${r.agents.join('、') || '—'} |`),
  ].join(NL);
  writeFileSync(OUT_DIR + `${tag}.md`, md + NL);
  console.log(`${NL}通過 ${passed}／${results.length}，通過率 ${rate}%（報告：eval-results/${tag}.md）`);
  process.exit(rate >= 90 ? 0 : 1);
}

// ── 展示情境多輪流程
type Flow = { name: string; run: (sid: string) => Promise<Check[]> };
const has = (c: Capture, t: string) => (c.meta?.tools ?? []).includes(t);
const FLOWS: Flow[] = [
  { name: 'S1 一般商品查詢', run: async (sid) => {
    const c = await turn(sid, '預算 3,000 以內有什麼適合送長輩的伴手禮？出國帶走。');
    return [{ name: '呼叫商品查詢', ok: has(c, 'query_products') || has(c, 'recommend_products') }, { name: '商品卡片', ok: c.cards?.type === 'product' }, { name: '附來源', ok: c.sources.length > 0 }, { name: '不派工', ok: (c.meta?.agents.length ?? 1) === 0 }, { name: '無簡體字', ok: !SIMPLIFIED.test(c.answer) }];
  } },
  { name: 'S2 個人化優惠推薦（驗證會員 A）', run: async (sid) => {
    const a = await turn(sid, '這次出國怎麼買最划算？幫我依我的消費紀錄算。');
    const v = await verifyAndResume(sid, '0900-000-001', '123456');
    const b = v.resume_message ? await turn(sid, v.resume_message) : null;
    const ids = b?.cards?.items?.map((x: any) => x.id) ?? [];
    return [{ name: '未驗證先跳驗證視窗', ok: a.actions.some((x) => x.type === 'verify') }, { name: '未驗證不讀會員資料', ok: !['get_user_profile', 'get_purchases', 'get_order'].some((t) => has(a, t)) }, { name: '驗證成功並接續', ok: v.ok && !!b }, { name: '呼叫 recommend_promos', ok: !!b && has(b, 'recommend_promos') }, { name: '推薦含美妝保養品牌週', ok: ids.includes('promo-beauty-week') }, { name: '附來源', ok: (b?.sources.length ?? 0) > 0 }];
  } },
  { name: 'S4 商品一問一答', run: async (sid) => {
    let c = await turn(sid, '想買香水送女朋友');
    const asked: string[] = [];
    for (let i = 0; i < 3 && c.cards?.type !== 'product' && c.cards?.type !== 'bundle'; i++) {
      const qr = c.actions.find((x) => x.type === 'quick_replies');
      if (!qr?.payload?.options?.length) break;
      asked.push(qr.payload.question);
      c = await turn(sid, qr.payload.options[0]);
    }
    return [{ name: '最多追問 3 題內出現商品卡片', ok: c.cards?.type === 'product' || c.cards?.type === 'bundle' }, { name: '每次追問都有快速回覆', ok: asked.every(Boolean) }, { name: '無中英夾雜與簡體字', ok: ![c.answer, ...asked].some((t) => /\b(look|check|OK)\b/i.test(t) || SIMPLIFIED.test(t)) }];
  } },
  { name: 'S7 出國購物一次規劃（multi-agent）', run: async (sid) => {
    const v = await verifyAndResume(sid, '0900-000-003', '123456');
    const c = await turn(sid, '我下週五從桃園飛東京，想預購一瓶威士忌跟送媽媽的保養品，預算一萬，現在有什麼優惠？在哪裡取貨？');
    const agents = c.meta?.agents ?? [];
    const shown = (n: number) => c.answer.includes(n.toLocaleString('en-US')) || c.answer.includes(String(n));
    return [{ name: '驗證會員 C', ok: v.ok }, { name: '派出 3 個專員', ok: ['product', 'promo', 'knowledge'].every((a) => agents.includes(a)) }, { name: '3 張組合卡片', ok: c.cards?.type === 'bundle' && c.cards.items.length === 3 }, { name: '結帳價與卡片一致', ok: c.cards?.type === 'bundle' && c.cards.items.every((x: any) => shown(x.bundle_price)) }, { name: '附來源', ok: c.sources.length > 0 }, { name: '工具 ≤ 6', ok: (c.meta?.tool_calls ?? 99) <= 6 }, { name: '不追問、不自行加總', ok: !c.actions.some((x) => x.type === 'quick_replies') && !/(合計|加起來)/.test(c.answer) }];
  } },
  { name: 'S10 超出範圍', run: async (sid) => {
    const c = await turn(sid, '其他免稅店是不是比較便宜？幫我比較采盈。');
    return [{ name: '不呼叫任何工具', ok: (c.meta?.tool_calls ?? 1) === 0 }, { name: '引導回服務按鈕', ok: c.actions.some((x) => x.type === 'quick_replies') }, { name: '不談其他業者價格', ok: !/\d[\d,]*\s*元/.test(c.answer) }];
  } },
];

async function runDemo() {
  const n = Number(opt('--repeat') ?? 3);
  const only = opt('--only')?.split(',');
  const flows = only ? FLOWS.filter((f) => only.some((o) => f.name.startsWith(o))) : FLOWS;
  const rows: { flow: string; round: number; ok: boolean; failed: string[]; ms: number }[] = [];
  for (const f of flows) {
    for (let r = 1; r <= n; r++) {
      const sid = `demo-${f.name.split(' ')[0]}-${r}-${Date.now()}`;
      const t0 = Date.now();
      let checks: Check[];
      try { checks = await f.run(sid); } catch (e) { checks = [{ name: '執行錯誤', ok: false, detail: (e as Error).message }]; }
      resetState(sid);
      const failed = checks.filter((c) => !c.ok).map((c) => c.name);
      rows.push({ flow: f.name, round: r, ok: !failed.length, failed, ms: Date.now() - t0 });
      console.log(`${failed.length ? '✗' : '✓'} ${f.name} 第 ${r} 次（${((Date.now() - t0) / 1000).toFixed(1)} 秒）${failed.length ? '：' + failed.join('、') : ''}`);
    }
  }
  const allOk = flows.every((f) => rows.filter((r) => r.flow === f.name).every((r) => r.ok));
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_DIR + `demo-latest${SUFFIX}.json`, JSON.stringify({ at: new Date().toISOString(), repeat: n, all_ok: allOk, rows }, null, 2) + NL);
  writeFileSync(OUT_DIR + `demo-latest${SUFFIX}.md`, [`# 展示情境連跑報告（每個 ${n} 次）`, '', `結果：**${allOk ? '全部成功' : '有失敗'}**`, '', '| 情境 | 次 | 結果 | 秒 | 失敗項目 |', '| --- | --- | --- | --- | --- |', ...rows.map((r) => `| ${r.flow} | ${r.round} | ${r.ok ? '成功' : '失敗'} | ${(r.ms / 1000).toFixed(1)} | ${r.failed.join('、') || '—'} |`)].join(NL) + NL);
  console.log(`${NL}${allOk ? '展示情境全部成功' : '展示情境有失敗'}（報告：eval-results/demo-latest${SUFFIX}.md）`);
  process.exit(allOk ? 0 : 1);
}

if (!apiKeyFor()) {
  console.error(`尚未設定 ${activeProvider() === 'inception' ? 'INCEPTION_API_KEY' : 'ANTHROPIC_API_KEY'}，無法執行評測。`);
  process.exit(2);
}
console.log(`模型供應商：${PROVIDER_LABEL[activeProvider()]}（主控 ${modelFor('orchestrator')}、專員 ${modelFor('agent')}）`);
if (flag('--demo')) await runDemo();
else await runEval();
