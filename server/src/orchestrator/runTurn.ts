import { getLlm, modelFor } from '../llm/index.js';
import { asOfDate } from '../data.js';
import { toTaiwan } from '../util/zh.js';
import { definitionsFor, runTool } from '../tools/index.js';
import type { Source, ToolFixtures, ToolResult } from '../types.js';
import { cardsFrom, type CardSet } from './cards.js';
import { buildSystemParts } from './prompt.js';
import { getActivePrompt } from '../prompts.js';
import { loadSettings } from '../config/settings.js';
import { afterTurn, observeTool, profileForTurn, profilePrompt, syncSession } from '../profile/index.js';
import { getState, pushHistory, type ChatState } from './sessions.js';
import { UI_TOOL_NAMES, uiToolDefinitions } from './ui-tools.js';
import { DISPATCH_TOOL_NAME, dispatchToolDefinition } from './dispatch-tool.js';
import { dispatchAgents, normalizeTasks, type AgentFixtures } from '../agents/index.js';
import { classifyMessage, fallbackSummary, guardHint, HOME_OPTIONS, isUnanswered, pricedWithoutSource, disclaimerFilter, RULE_LOOKUP, CONSECUTIVE_LIMIT, type HandoffReason } from './guard.js';

/** 評測與測試用覆寫：專員逾時、工具資料（來源、知識庫）、先前連續答不出的次數 */
export type TurnFixtures = AgentFixtures & { tools?: ToolFixtures; consecutive_unanswered?: number };

export type Emit = (event: string, data: unknown) => void;

/** 防護規則的硬上限；實際上限由後台系統參數設定（不得超過此值） */
export const MAX_TOOL_CALLS = 6;
const MAX_STEPS = 8;
const NL = String.fromCharCode(10);

const STATUS: Record<string, string> = {
  verify_identity: '正在驗證會員身分…',
  get_user_profile: '正在讀取會員資料…',
  get_purchases: '正在分析近 6 個月消費…',
  get_order: '正在查詢訂單…',
  query_promos: '正在查詢優惠活動…',
  recommend_promos: '正在計算最划算的優惠…',
  query_products: '正在查詢商品…',
  recommend_products: '正在挑選商品…',
  get_promo_price: '正在計算優惠價…',
  search_kb: '正在查詢知識庫…',
  search_official_web: '正在搜尋昇恆昌官網…',
  generate_comparison: '正在產生比較表…',
  handoff_to_human: '正在轉接真人客服…',
};

/** 在最後一則訊息加快取標記：同一輪的下一步（工具結果之後）可以沿用前面的快取 */
function cacheLast(messages: any[]): any[] {
  if (!messages.length) return messages;
  const last = messages[messages.length - 1];
  const blocks = typeof last.content === 'string' ? [{ type: 'text', text: last.content }] : [...last.content];
  if (!blocks.length) return messages;
  blocks[blocks.length - 1] = { ...blocks[blocks.length - 1], cache_control: { type: 'ephemeral' } };
  return [...messages.slice(0, -1), { ...last, content: blocks }];
}

function handleUiTool(name: string, input: any, state: ChatState, message: string, emit: Emit): ToolResult {
  if (name === 'request_verification') {
    state.pending_question = message;
    emit('action', { type: 'verify', payload: { reason: input?.reason ?? '' } });
    return { ok: true, data: { shown: true, note: '驗證視窗已顯示。請用一句話告知用戶完成驗證後會繼續處理，然後停止回答。' } };
  }
  const options = Array.isArray(input?.options) ? input.options.slice(0, 4).map((o: unknown) => toTaiwan(String(o))) : [];
  emit('action', { type: 'quick_replies', payload: { question: toTaiwan(String(input?.question ?? '')), options } });
  return { ok: true, data: { shown: true } };
}

export type TurnMeta = {
  tool_calls: number;
  tools: string[];
  searched: boolean;
  grounded: boolean;
  ms: number;
  /** 本輪派出的專員（promo／product／order／knowledge），沒有派工時為空陣列 */
  agents: string[];
  /** 各專員結果：done／timeout／error／skipped */
  agent_status: Record<string, string>;
  /** 本輪使用的提示詞版本；讀檔失敗退回內建時為 v1 */
  prompt_version: string;
  /** T8 防護判定：out_of_scope／handoff／null */
  guard: string | null;
  /** 本輪是否判定為答不出來 */
  unanswered: boolean;
  /** 本輪結束後的連續答不出次數 */
  unanswered_streak: number;
  /** T15：本輪提示主控順帶一提的 NBA 規則 */
  nba: string | null;
};

export async function runTurn(sessionId: string, message: string, emit: Emit, opts: { signal?: AbortSignal; fixtures?: TurnFixtures } = {}) {
  const started = Date.now();
  const model = modelFor('orchestrator');
  if (!model) throw new Error('MODEL_NOT_CONFIGURED');
  const state = getState(sessionId);
  const settings = loadSettings();
  const maxCalls = Math.min(MAX_TOOL_CALLS, settings.max_tool_calls);
  // 每輪重新讀取後台可編輯的提示詞，同一輪內固定使用同一版
  const activePrompt = getActivePrompt();
  if (activePrompt.error) console.warn('提示詞讀取失敗，改用內建 v1：', activePrompt.error);
  if (typeof opts.fixtures?.consecutive_unanswered === 'number') state.unanswered_streak = opts.fixtures.consecutive_unanswered;
  const streak = state.unanswered_streak ?? 0;
  // T8：先由程式判斷是否超出範圍或需要轉真人，再決定這一輪能用哪些工具
  const guard = classifyMessage(message, streak);
  // T15：客戶畫像（後台）——注入已知需求與符合接觸政策的一句建議；超出範圍或轉真人時不推銷
  const profile = profileForTurn(sessionId);
  if (profile) syncSession(profile, state.session);
  const pp = guard ? { text: '', offer: null } : profilePrompt(profile);
  const mustLookup = !guard && RULE_LOOKUP.test(message);
  const extra = [
    ...guardHint(guard, streak),
    ...(mustLookup ? ['- 本輪涉及規定（免稅額度、液體、點數效期或預購期限）：先查知識庫（與已驗證時的會員資料）再回答，不可憑記憶'] : []),
    `- 展示資料聲明：${state.mock_disclosed ? '本段對話已經說過，這次不要再加' : '本段對話尚未說過'}`,
    ...(pp.text ? ['', pp.text] : []),
  ];
  const parts = buildSystemParts(state, asOfDate(), activePrompt, extra, settings);
  // prompt caching：工具定義＋固定提示詞每步都重送，標記快取後重送時更快、輸入費用約一成（Inception 轉接層會忽略標記）
  const system = [
    { type: 'text', text: parts.fixed, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: parts.dynamic },
  ];
  const offeredOptions: string[] = [];
  const messages: any[] = [...state.history.map((h) => ({ role: h.role, content: h.content })), { role: 'user', content: message }];
  const tools =
    guard?.kind === 'out_of_scope'
      ? []
      : guard?.kind === 'handoff'
        ? definitionsFor(['handoff_to_human'])
        : [...definitionsFor(), ...uiToolDefinitions, dispatchToolDefinition];
  const toolCtx = { session: state.session, fixtures: opts.fixtures?.tools };

  const sources: Source[] = [];
  const seen = new Set<string>();
  const used: string[] = [];
  let cards: CardSet | null = null;
  let toolCalls = 0;
  let answer = '';
  let needBreak = false;
  let verifyShown = false;
  const agents: string[] = [];
  const agentStatus: Record<string, string> = {};
  const toolErrors: string[] = [];
  let handedOff = false;

  for (let step = 0; step < MAX_STEPS; step++) {
    const limitReached = toolCalls >= maxCalls;
    const stream = getLlm().messages.stream(
      {
        model,
        max_tokens: 2000,
        system,
        messages: cacheLast(messages),
        ...(tools.length ? { tools } : {}),
        ...(limitReached && tools.length ? { tool_choice: { type: 'none' } } : mustLookup && step === 0 && tools.length ? { tool_choice: { type: 'any' } } : {}),
      } as any,
      { signal: opts.signal },
    );
    const filter = disclaimerFilter(!!state.mock_disclosed);
    const put = (t: string) => {
      if (needBreak && t.trim()) {
        emit('delta', { text: NL + NL });
        answer += NL + NL;
        needBreak = false;
      }
      if (!t) return;
      answer += t;
      emit('delta', { text: t });
    };
    stream.on('text', (raw: string) => {
      // 語言防護：送出前把簡體轉為台灣正體，歷史也存轉換後的文字
      put(filter.push(toTaiwan(raw)));
    });
    const t0 = Date.now();
    const final: any = await stream.finalMessage();
    if (process.env.LLM_DEBUG) console.error(`[主控 step ${step}] ${Date.now() - t0}ms 輸入 ${final.usage?.input_tokens ?? '?'}、快取讀 ${final.usage?.cache_read_input_tokens ?? 0}、快取寫 ${final.usage?.cache_creation_input_tokens ?? 0}、輸出 ${final.usage?.output_tokens ?? '?'}`);
    put(filter.flush());
    messages.push({ role: 'assistant', content: final.content });
    if (final.stop_reason !== 'tool_use') break;

    const results: any[] = [];
    for (const block of final.content) {
      if (block.type !== 'tool_use') continue;
      let result: ToolResult;
      if (block.name === DISPATCH_TOOL_NAME) {
        // 派工本身不計次，專員內的每次工具呼叫才計入每輪 6 次上限
        const { ok: tasks, rejected } = normalizeTasks((block.input as any)?.tasks, agents.length, settings.max_agents);
        if (toolCalls >= maxCalls) {
          result = { ok: false, error: 'TOOL_LIMIT_REACHED' };
        } else if (!tasks.length) {
          result = { ok: false, error: rejected.length ? 'AGENT_LIMIT_OR_INVALID' : 'NO_TASKS' };
        } else {
          const out = await dispatchAgents(tasks, {
            session: state.session,
            remaining: maxCalls - toolCalls,
            timeoutMs: settings.agent_timeout_seconds * 1000,
            emit,
            fixtures: opts.fixtures,
            signal: opts.signal,
          });
          toolCalls += out.tool_calls;
          used.push(...out.tools);
          for (const r of out.runs) {
            agents.push(r.agent);
            agentStatus[r.agent] = r.status;
            if (profile) for (const c of r.calls) observeTool(profile, c.tool, c.result, state.session);
          }
          if (out.cards) cards = out.cards;
          if (out.need_verify && !verifyShown) {
            verifyShown = true;
            state.pending_question = message;
            emit('action', { type: 'verify', payload: { reason: '需要驗證會員身分才能查詢會員資料' } });
          }
          result = { ok: true, data: { ...(out.payload as object), rejected_agents: rejected }, sources: out.sources };
        }
      } else if (!tools.some((t: any) => t.name === block.name)) {
        // 本輪沒有開放的工具（例如超出範圍時要求搜尋），一律拒絕
        result = { ok: false, error: 'TOOL_NOT_ALLOWED' };
      } else if (toolCalls >= maxCalls) {
        result = { ok: false, error: 'TOOL_LIMIT_REACHED' };
      } else {
        toolCalls++;
        used.push(block.name);
        if (UI_TOOL_NAMES.includes(block.name)) {
          if (block.name === 'request_verification') verifyShown = true;
          result = handleUiTool(block.name, block.input, state, message, emit);
        } else {
          emit('status', { text: STATUS[block.name] ?? '處理中…', tool: block.name });
          result = await runTool(block.name, block.input, toolCtx);
        }
      }
      for (const s of result.sources ?? []) {
        const key = s.url + '|' + (s.cited_text ?? '');
        if (!seen.has(key)) {
          seen.add(key);
          sources.push(s);
        }
      }
      if (profile && block.name !== DISPATCH_TOOL_NAME) observeTool(profile, block.name, result, state.session);
      if (block.name === 'show_quick_replies' && Array.isArray((block.input as any)?.options)) offeredOptions.push(...(block.input as any).options.slice(0, 4).map(String));
      if (result.ok && block.name !== DISPATCH_TOOL_NAME) {
        const c = cardsFrom(block.name, result);
        if (c) cards = c;
        if (block.name === 'generate_comparison') emit('action', { type: 'compare', payload: result.data });
        if (block.name === 'handoff_to_human') {
          handedOff = true;
          emit('action', { type: 'handoff', payload: result.data });
        }
      }
      if (!result.ok && result.error) toolErrors.push(result.error.split(':')[0]);
      if (!result.ok && !verifyShown && (result.error === 'NEED_VERIFY' || result.error === 'NEED_VERIFY_OR_MANUAL_BASKET')) {
        verifyShown = true;
        state.pending_question = message;
        emit('action', { type: 'verify', payload: { reason: '需要驗證會員身分才能查詢會員資料' } });
      }
      results.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content:
          block.name === DISPATCH_TOOL_NAME
            ? JSON.stringify({ ok: result.ok, error: result.error, data: result.data, source_count: result.sources?.length ?? 0 }).slice(0, 16000)
            : JSON.stringify({ ok: result.ok, error: result.error, data: result.data, sources: result.sources }).slice(0, 12000),
        ...(result.ok ? {} : { is_error: true }),
      });
    }
    // 本步只跳出驗證視窗時直接結束，不再多花一次模型呼叫寫提示句（省 3–5 秒）
    const stepTools = final.content.filter((b: any) => b.type === 'tool_use').map((b: any) => b.name);
    if (stepTools.length && stepTools.every((n: string) => n === 'request_verification')) {
      if (!answer.trim()) {
        const t = '請在畫面上完成會員驗證，驗證後我會馬上接著處理你的問題。';
        answer += t;
        emit('delta', { text: t });
      }
      break;
    }
    messages.push({ role: 'user', content: results });
    needBreak = answer.trim().length > 0;
  }

  // 保險：查了資料卻沒有產生任何文字時（模型偶爾在工具結果後直接結束），不帶工具再請它回答一次
  if (!answer.trim() && toolCalls > 0 && !verifyShown && guard?.kind !== 'out_of_scope') {
    while (messages.length && messages[messages.length - 1].role === 'assistant' && !(messages[messages.length - 1].content ?? []).length) messages.pop();
    const tail = messages[messages.length - 1];
    if (tail?.role === 'assistant') messages.push({ role: 'user', content: '（系統）請根據上面的查詢結果，直接回答用戶剛才的問題。' });
    else if (tail?.role === 'user' && Array.isArray(tail.content)) tail.content = [...tail.content, { type: 'text', text: '（系統）請根據以上查詢結果直接回答用戶，不要再呼叫工具。' }];
    try {
      const retry: any = await getLlm().messages.create({ model, max_tokens: 2000, system, messages: cacheLast(messages), ...(tools.length ? { tools, tool_choice: { type: 'none' } } : {}) } as any, { signal: opts.signal });
      const filter = disclaimerFilter(!!state.mock_disclosed);
      const text = (retry.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
      const out = filter.push(toTaiwan(text)) + filter.flush();
      if (out.trim()) {
        answer += out;
        emit('delta', { text: out });
      }
    } catch (e) {
      if (process.env.LLM_DEBUG) console.error('補回答失敗：', (e as Error).message);
    }
  }

  // T8 收尾：補建工單、無來源提醒、連續答不出計數
  const say = (t: string) => {
    const piece = (answer.trim() ? NL + NL : '') + t;
    answer += piece;
    emit('delta', { text: piece });
  };
  const handoff = async (reason: HandoffReason) => {
    const r = await runTool('handoff_to_human', { summary: fallbackSummary(message, state.history, reason), reason }, toolCtx);
    if (!r.ok) return;
    handedOff = true;
    used.push('handoff_to_human');
    emit('status', { text: STATUS.handoff_to_human, tool: 'handoff_to_human' });
    emit('action', { type: 'handoff', payload: r.data });
    const id = (r.data as any)?.ticket_id;
    say(reason === 'unanswered'
      ? `抱歉，已經連續 ${CONSECUTIVE_LIMIT} 次沒能回答你的問題，已幫你轉給專人，工單編號 ${id}，專人會再與你聯繫。（展示用模擬工單，未實際轉接）`
      : `已幫你轉給專人，工單編號 ${id}，專人會再與你聯繫。（展示用模擬工單，未實際轉接）`);
  };
  if (guard?.kind === 'handoff' && !handedOff) await handoff(guard.reason);
  if (guard?.kind === 'out_of_scope') {
    emit('action', { type: 'quick_replies', payload: { question: '你可以從這些服務開始：', options: HOME_OPTIONS } });
    offeredOptions.push(...HOME_OPTIONS);
  }
  // 訂單、點數、消費紀錄等金額來自會員本人的資料（工具回傳），不需要官網來源
  const personalData = ['get_order', 'get_user_profile', 'get_purchases'].some((t) => used.includes(t)) && !toolErrors.some((e) => e.startsWith('NEED_VERIFY'));
  // 用戶自己說的金額（預算）不算無來源報價；規定類問題不沿用前文金額
  const said = [...state.history.filter((h) => h.role === 'user' || !mustLookup).map((h) => (typeof h.content === 'string' ? h.content : '')), message].join('\n');
  const asked = offeredOptions.length > 0 && !cards;
  if (!handedOff && !personalData && !asked && pricedWithoutSource(answer, sources.length, said)) say('提醒：以上金額目前查不到來源，請以昇恆昌公告為準，或轉真人客服確認。');
  const unanswered = !personalData && isUnanswered({ answer, sources: sources.length, toolErrors, verifyShown, handedOff, guard, asked, context: said });
  let nextStreak = handedOff ? 0 : unanswered ? streak + 1 : guard?.kind === 'out_of_scope' ? streak : 0;
  if (!handedOff && nextStreak >= CONSECUTIVE_LIMIT) {
    await handoff('unanswered');
    nextStreak = 0;
  } else if (unanswered && !handedOff) {
    emit('action', { type: 'quick_replies', payload: { question: '需要幫你轉真人客服嗎？', options: ['轉真人客服', '換個問題'] } });
    offeredOptions.push('轉真人客服', '換個問題');
  }
  state.unanswered_streak = nextStreak;

  if (cards) emit('cards', cards);
  if (sources.length) emit('sources', sources);
  const text = answer.trim();
  if (text.includes('展示資料')) state.mock_disclosed = true;
  const shownItems = (cards?.items ?? []).slice(0, 4).map((x: any) => x.name ?? x.product?.name ?? x.order_no).filter(Boolean);
  const note = [offeredOptions.length ? `本輪提供的選項：${offeredOptions.map(toTaiwan).join('／')}` : '', shownItems.length ? `畫面顯示：${shownItems.join('、')}` : ''].filter(Boolean).join('；');
  pushHistory(state, message, text, note);
  afterTurn(profile, { user: message, assistant: text, options: state.last_options ?? [], offer: pp.offer });
  state.last_options = offeredOptions.map(toTaiwan);
  const meta: TurnMeta = {
    tool_calls: toolCalls,
    tools: used,
    searched: used.includes('search_official_web') || used.includes('search_kb'),
    grounded: sources.length > 0,
    ms: Date.now() - started,
    agents,
    agent_status: agentStatus,
    prompt_version: activePrompt.version,
    guard: guard ? (guard.kind === 'handoff' ? `handoff:${guard.reason}` : `out_of_scope:${guard.why}`) : null,
    unanswered,
    unanswered_streak: nextStreak,
    nba: pp.offer?.id ?? null,
  };
  emit('done', { meta });
  return { answer: text, meta, cards, sources };
}
