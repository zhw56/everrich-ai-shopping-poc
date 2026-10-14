import { loadUsers } from '../data.js';

/** T9 對話紀錄：只存在記憶體，伺服器重啟即清空；存入前先遮罩個資 */
export type TurnLog = {
  id: string;
  at: string;
  session: string;
  question: string;
  answer: string;
  ok: boolean;
  meta: Record<string, unknown> | null;
  flagged: boolean;
  flag_note: string;
};

const MAX_LOGS = 500;
const logs: TurnLog[] = [];
let seq = 0;

/** 手機號碼遮罩中間 4 碼、姓名遮罩第 2 字（PRD 系統參數） */
export function maskText(text: string): string {
  let t = String(text ?? '').replace(/09\d{2}-?\d{3}-?\d{3}/g, (m) => {
    const d = m.replace(/-/g, '');
    return `${d.slice(0, 4)}-****-${d.slice(8)}`;
  });
  for (const u of loadUsers().users) {
    const name = String((u as any).name ?? '');
    if (name.length >= 2) t = t.split(name).join(name[0] + '*' + name.slice(2));
  }
  return t;
}

const maskSession = (s: string) => (s.length <= 6 ? s : s.slice(0, 4) + '…' + s.slice(-2));

export function recordTurn(sessionId: string, question: string, answer: string, meta: Record<string, unknown> | null) {
  logs.unshift({
    id: `log-${Date.now().toString(36)}-${(++seq).toString(36)}`,
    at: new Date().toISOString(),
    session: maskSession(sessionId),
    question: maskText(question).slice(0, 1000),
    answer: maskText(answer).slice(0, 4000),
    ok: meta !== null,
    meta,
    flagged: false,
    flag_note: '',
  });
  if (logs.length > MAX_LOGS) logs.length = MAX_LOGS;
}

export function listLogs(): TurnLog[] {
  return logs;
}

export function flagLog(id: string, flagged: boolean, note: string): TurnLog | null {
  const l = logs.find((x) => x.id === id);
  if (!l) return null;
  l.flagged = flagged;
  l.flag_note = maskText(String(note ?? '')).slice(0, 500);
  return l;
}

/** 只供測試使用 */
export function clearLogs() {
  logs.length = 0;
}

const PRICE_TOOLS = ['query_promos', 'recommend_promos', 'get_promo_price', 'query_products', 'recommend_products'];
const MONEY = /\d[\d,]*\s*元|NT\$\s*\d/;

/** 由本機實際對話紀錄計算的監控指標（不是假資料） */
export function liveStats() {
  const done = logs.filter((l) => l.ok && l.meta);
  const m = (l: TurnLog) => l.meta as any;
  const priceTurns = done.filter((l) => MONEY.test(l.answer) || (m(l).tools ?? []).some((t: string) => PRICE_TOOLS.includes(t)));
  const ungrounded = priceTurns.filter((l) => !m(l).grounded);
  const handoff = done.filter((l) => (m(l).tools ?? []).includes('handoff_to_human'));
  const searchTurns = done.filter((l) => (m(l).tools ?? []).some((t: string) => t === 'search_official_web' || t === 'search_kb'));
  const ms = done.map((l) => Number(m(l).ms) || 0).sort((a, b) => a - b);
  // 最近排名法（nearest-rank）：第 ceil(p×n) 筆；舊寫法 floor((n-1)×p) 在筆數少時會把 P95 算成第 4 慢而不是最慢
  const pct = (p: number) => (ms.length ? ms[Math.min(ms.length - 1, Math.max(0, Math.ceil(ms.length * p) - 1))] : null);
  const ratio = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);
  return {
    turns: logs.length,
    errors: logs.length - done.length,
    error_rate: ratio(logs.length - done.length, logs.length),
    price_turns: priceTurns.length,
    ungrounded_price_turns: ungrounded.length,
    zero_search_ratio: ratio(ungrounded.length, priceTurns.length),
    handoff_rate: ratio(handoff.length, done.length),
    search_turns: searchTurns.length,
    out_of_scope: done.filter((l) => String(m(l).guard ?? '').startsWith('out_of_scope')).length,
    flagged: logs.filter((l) => l.flagged).length,
    turn_ms_p50: pct(0.5),
    turn_ms_p95: pct(0.95),
  };
}
