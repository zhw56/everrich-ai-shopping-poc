import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { DATA_DIR } from './data.js';

/**
 * 後台可編輯的系統提示詞（data/prompts.json）。
 * 只存業務說明與回答格式；固定防護規則與「目前狀態」區塊留在 orchestrator/prompt.ts，不開放編輯。
 * 每輪對話重新讀檔，讀取失敗或內容為空時退回內建 v1，確保對話不中斷。
 */

export type PromptVersion = { version: string; created_at: string; author: string; note: string; content: string };
export type PromptStore = { active_version: string; versions: PromptVersion[] };
export type ActivePrompt = { version: string; content: string; source: 'file' | 'builtin'; error?: string };
type Opts = { file?: string };

const NL = String.fromCharCode(10);
export const PROMPTS_FILE = DATA_DIR + 'prompts.json';
export const MAX_CONTENT_LENGTH = 20000;
const VERSION_RE = /^[A-Za-z0-9._-]{1,32}$/;

export const BUILTIN_PROMPT_V1 = [
  '你是「昇恆昌購物小幫手」，協助旅客與會員挑選免稅商品、找出最划算的優惠、查詢預購單與提貨方式，並說明出入境購物規定。昇恆昌有兩個通路：免稅店（機場、市區預購、免稅購物網預購，出境當天提貨）與宅配網（不用出國、寄到家）。',
  '',
  '# 業務規則',
  '- 通路判斷：說了出發日、航班、機場或出國，就是免稅店（channel: dutyfree）；說了寄到家、不出國或宅配，就是宅配網（channel: home）。都沒說時不要為了通路追問，先用免稅店查詢與回答，並在回答最後用一句話提醒「不出國的話，也可以用宅配網寄到家（價格不同）」；用戶之後說要寄到家，再改用 channel: home 重新查詢。',
  '- 商品價格用 query_products 或 recommend_products；優惠活動用 query_promos；「怎麼買最划算」用 recommend_promos；單件商品套用優惠後的價格用 get_promo_price。規定、門市與服務先用 search_kb；查不到、結果 stale 為 true、只答到問題的一部分，或要查最新活動時，再用 search_official_web（可搜整個昇恆昌官網）。商品資料只收錄部分展示商品，查不到某個品牌或商品時，不可說昇恆昌沒有賣，要說明展示資料沒有收錄，請用戶到昇恆昌免稅購物網或宅配網搜尋。',
  '- 需要會員資料（等級、點數、航班、消費紀錄、預購單，或想依自己的消費推薦）而狀態為未驗證時，第一步就直接呼叫 request_verification，不要先詢問用戶是否願意驗證。驗證視窗本身提供「不驗證，自己說預算」的選項；用戶選擇不驗證時，改問這次大概的預算與想買的分類，再用 recommend_promos 的 manual_basket 推薦。',
  '- 會員的出發日在活動截止日之後時，要說明哪些活動出發時已結束（引用 trip_option.ending_before_trip），以及預購開放日（preorder_opens）；點數在出發前到期時（points_option.expires_before_trip），提醒可以先用點數折抵。',
  '- 商品推薦條件不足時，一次只追問一題，最多 3 題（預算、品牌或喜好、送禮對象），並呼叫 show_quick_replies 提供 2 到 4 個選項。用戶已說明條件就直接推薦。',
  '- 回答酒類商品時，提醒入境每人酒類免稅數量（依 search_kb）；同行人數多時說明額度是每人分開計算。',
  '- 用戶想比較、保存或帶去機場時，呼叫 generate_comparison。',
  '- 涉及客訴、退貨、退款，或用戶要求真人時，呼叫 handoff_to_human。',
  '- 問題同時涉及 2 個以上領域（例如挑商品＋找優惠＋問取貨）時，只呼叫一次 dispatch_agents 平行派工，每個任務寫清楚用戶條件（想買什麼、預算、送誰、出國帶走或寄到家）；只涉及單一領域時不要派工，直接呼叫對應工具。需要會員資料而未驗證時先驗證再派工；已驗證時不必先查會員資料，專員會自行讀取。派工後直接整合專員結果回答，不要再追問預算或品牌。',
  '',
  '# 回答格式',
  '- 語氣親切專業，像門市裡懂行的店員。',
  '- 先一句結論，再用 2 到 4 點條列重點，全文 150 字以內（派工整合 3 組組合時可到 250 字）。畫面會另外顯示商品與優惠卡片與來源，不必逐字重複卡片內容。',
  '- 不要輸出完整手機號碼或網址，來源由畫面顯示。',
].join(NL);

export function builtinStore(): PromptStore {
  return {
    active_version: 'v1',
    versions: [{ version: 'v1', created_at: '2026-10-14T00:00:00+08:00', author: 'system', note: '昇恆昌購物小幫手內建提示詞', content: BUILTIN_PROMPT_V1 }],
  };
}

/** 驗證格式，回傳錯誤清單（空陣列代表通過） */
export function validatePromptStore(x: unknown): string[] {
  const errors: string[] = [];
  const s = x as PromptStore;
  if (!s || typeof s !== 'object') return ['格式必須是物件'];
  if (!Array.isArray(s.versions) || !s.versions.length) errors.push('versions 必須是非空陣列');
  const seen = new Set<string>();
  for (const [i, v] of (Array.isArray(s.versions) ? s.versions : []).entries()) {
    const at = `versions[${i}]`;
    if (!v || typeof v !== 'object') {
      errors.push(`${at} 必須是物件`);
      continue;
    }
    if (typeof v.version !== 'string' || !VERSION_RE.test(v.version)) errors.push(`${at}.version 只能用英數字、點、底線、連字號，1 到 32 字`);
    else if (seen.has(v.version)) errors.push(`${at}.version 重複：${v.version}`);
    else seen.add(v.version);
    if (typeof v.created_at !== 'string' || Number.isNaN(Date.parse(v.created_at))) errors.push(`${at}.created_at 必須是日期時間字串`);
    if (typeof v.author !== 'string' || v.author.length > 50) errors.push(`${at}.author 必須是 50 字以內的字串`);
    if (typeof v.note !== 'string' || v.note.length > 200) errors.push(`${at}.note 必須是 200 字以內的字串`);
    if (typeof v.content !== 'string' || !v.content.trim()) errors.push(`${at}.content 不可為空`);
    else if (v.content.length > MAX_CONTENT_LENGTH) errors.push(`${at}.content 超過 ${MAX_CONTENT_LENGTH} 字`);
  }
  if (typeof s.active_version !== 'string' || !seen.has(s.active_version)) errors.push('active_version 必須是 versions 中存在的版本');
  return errors;
}

export function loadPromptStore(opts: Opts = {}): { ok: true; store: PromptStore } | { ok: false; error: string } {
  const file = opts.file ?? PROMPTS_FILE;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    return { ok: false, error: `PROMPTS_READ_FAILED: ${(e as Error).message}` };
  }
  const errors = validatePromptStore(parsed);
  return errors.length ? { ok: false, error: 'PROMPTS_INVALID: ' + errors.join('；') } : { ok: true, store: parsed as PromptStore };
}

/** 每輪呼叫；任何問題都退回內建 v1 */
export function getActivePrompt(opts: Opts = {}): ActivePrompt {
  const r = loadPromptStore(opts);
  if (r.ok) {
    const v = r.store.versions.find((x) => x.version === r.store.active_version);
    if (v && v.content.trim()) return { version: v.version, content: v.content, source: 'file' };
  }
  return { version: 'v1', content: BUILTIN_PROMPT_V1, source: 'builtin', error: r.ok ? 'ACTIVE_VERSION_EMPTY' : r.error };
}

/** 原子寫入：先寫暫存檔再 rename，避免寫到一半的檔案被讀到 */
function writeStore(store: PromptStore, file: string) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify(store, null, 2) + NL, 'utf8');
  renameSync(tmp, file);
}

/** 讀取現有檔案；檔案不存在時以內建 v1 初始化，檔案損壞時拒絕寫入以免覆蓋 */
function storeForWrite(file: string): { ok: true; store: PromptStore } | { ok: false; error: string } {
  if (!existsSync(file)) return { ok: true, store: builtinStore() };
  return loadPromptStore({ file });
}

function nextVersion(store: PromptStore): string {
  const nums = store.versions.map((v) => /^v(\d+)$/.exec(v.version)?.[1]).filter(Boolean).map(Number);
  return 'v' + ((nums.length ? Math.max(...nums) : 0) + 1);
}

export type SaveInput = { content: string; author: string; note?: string; version?: string; activate?: boolean };
export type StoreResult = { ok: true; store: PromptStore; version: string } | { ok: false; error: string; errors?: string[] };

/** 新增一個版本（不覆蓋舊版本）；activate 為 true 時同時設為啟用版本 */
export function savePromptVersion(input: SaveInput, opts: Opts = {}): StoreResult {
  const file = opts.file ?? PROMPTS_FILE;
  const cur = storeForWrite(file);
  if (!cur.ok) return { ok: false, error: cur.error };
  const store = cur.store;
  const version = input.version ?? nextVersion(store);
  if (store.versions.some((v) => v.version === version)) return { ok: false, error: 'VERSION_EXISTS' };
  const entry: PromptVersion = {
    version,
    created_at: new Date().toISOString(),
    author: String(input.author ?? '').trim(),
    note: String(input.note ?? '').trim(),
    content: String(input.content ?? '').replace(/\r\n/g, NL),
  };
  const next: PromptStore = { active_version: input.activate ? version : store.active_version, versions: [...store.versions, entry] };
  const errors = validatePromptStore(next);
  if (errors.length) return { ok: false, error: 'PROMPTS_INVALID', errors };
  writeStore(next, file);
  return { ok: true, store: next, version };
}

/** 切換啟用版本（可用來回滾） */
export function setActiveVersion(version: string, opts: Opts = {}): StoreResult {
  const file = opts.file ?? PROMPTS_FILE;
  const cur = storeForWrite(file);
  if (!cur.ok) return { ok: false, error: cur.error };
  if (!cur.store.versions.some((v) => v.version === version)) return { ok: false, error: 'VERSION_NOT_FOUND' };
  const next: PromptStore = { ...cur.store, active_version: version };
  writeStore(next, file);
  return { ok: true, store: next, version };
}
