import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { DATA_DIR, loadBundles, loadKb, loadProducts, loadPromos, type SourceEntry } from '../data.js';
import { isOfficialHost, isPartnerHost, OFFICIAL_DOMAINS, PARTNER_DOMAINS } from '../tools/websearch.js';

/** T9 搜尋來源管理：讀寫 data/sources.json（唯一來源清單），規則見 data/README.md */
export const SOURCES_FILE = DATA_DIR + 'sources.json';
const FIELDS = ['id', 'type', 'title', 'url', 'enabled', 'last_checked', 'note'] as const;
const TYPES = ['promo', 'product', 'faq'];
const NL = String.fromCharCode(10);

type Opts = { file?: string };
export type SourcesResult = { ok: true; sources: SourceEntry[] } | { ok: false; error: string; errors?: string[] };


function validDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** 只允許 HTTPS、無帳密、預設 port、核准的官方網域（或只供追溯的合作夥伴網域）與其真正子網域 */
export function urlError(url: unknown): string | null {
  if (typeof url !== 'string' || !url.trim()) return '網址必填';
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return '網址格式錯誤';
  }
  if (u.protocol !== 'https:') return '只接受 HTTPS 網址';
  if (u.username || u.password) return '網址不可包含帳號密碼';
  if (u.port) return '網址不可指定連接埠';
  const h = u.hostname.toLowerCase();
  if (!isOfficialHost(h) && !isPartnerHost(h)) return `只接受 ${[...OFFICIAL_DOMAINS, ...PARTNER_DOMAINS].join('、')} 或其子網域`;
  return null;
}

export function validateSources(list: unknown): string[] {
  if (!Array.isArray(list)) return ['來源清單必須是陣列'];
  const errors: string[] = [];
  const ids = new Set<string>();
  list.forEach((s: any, i) => {
    const at = `第 ${i + 1} 筆${s?.id ? `（${s.id}）` : ''}`;
    if (!s || typeof s !== 'object' || Array.isArray(s)) return void errors.push(`${at}格式錯誤`);
    const extra = Object.keys(s).filter((k) => !(FIELDS as readonly string[]).includes(k));
    if (extra.length) errors.push(`${at}有不允許的欄位：${extra.join('、')}`);
    if (typeof s.id !== 'string' || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(s.id)) errors.push(`${at} ID 只能用小寫英數與連字號（2–64 字）`);
    else if (ids.has(s.id)) errors.push(`${at} ID 重複`);
    else ids.add(s.id);
    if (!TYPES.includes(s.type)) errors.push(`${at}分類必須是 promo、product 或 faq`);
    if (typeof s.title !== 'string' || !s.title.trim() || s.title.length > 120) errors.push(`${at}標題必填且不超過 120 字`);
    const ue = urlError(s.url);
    if (ue) errors.push(`${at}${ue}`);
    if (typeof s.enabled !== 'boolean') errors.push(`${at} enabled 必須是 true 或 false`);
    if (!(s.last_checked === null || (typeof s.last_checked === 'string' && validDate(s.last_checked)))) errors.push(`${at}最後檢查日必須是 YYYY-MM-DD 或空白`);
    if (typeof s.note !== 'string' || s.note.length > 1000) errors.push(`${at}備註必須是文字且不超過 1000 字`);
  });
  return errors;
}

export function loadSourcesFile(opts: Opts = {}): SourcesResult {
  try {
    const list = JSON.parse(readFileSync(opts.file ?? SOURCES_FILE, 'utf8'));
    const errors = validateSources(list);
    return errors.length ? { ok: false, error: 'INVALID_SOURCES_FILE', errors } : { ok: true, sources: list };
  } catch (e) {
    return { ok: false, error: `READ_FAILED: ${(e as Error).message}` };
  }
}

function write(list: SourceEntry[], opts: Opts): SourcesResult {
  const errors = validateSources(list);
  if (errors.length) return { ok: false, error: 'VALIDATION_FAILED', errors };
  const file = opts.file ?? SOURCES_FILE;
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(list, null, 2) + NL, 'utf8');
  renameSync(tmp, file);
  return { ok: true, sources: list };
}

/** 整理輸入：只取七個欄位，字串去頭尾空白，空白日期轉 null */
export function normalizeSource(input: any): SourceEntry {
  const s = input ?? {};
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : v);
  const lc = str(s.last_checked);
  return {
    id: str(s.id) as string,
    type: str(s.type) as SourceEntry['type'],
    title: str(s.title) as string,
    url: str(s.url) as string,
    enabled: s.enabled,
    last_checked: lc === '' || lc === undefined ? null : (lc as string | null),
    note: typeof s.note === 'string' ? s.note.trim() : s.note === undefined ? '' : s.note,
  };
}

export function createSource(input: unknown, opts: Opts = {}): SourcesResult {
  const cur = loadSourcesFile(opts);
  if (!cur.ok) return cur;
  const s = normalizeSource(input);
  if (cur.sources.some((x) => x.id === s.id)) return { ok: false, error: 'ID_EXISTS', errors: [`ID ${s.id} 已存在`] };
  return write([...cur.sources, s], opts);
}

/** 修改既有來源；ID 不可更改，避免 source_id 關聯懸空 */
export function updateSource(id: string, input: unknown, opts: Opts = {}): SourcesResult {
  const cur = loadSourcesFile(opts);
  if (!cur.ok) return cur;
  const i = cur.sources.findIndex((x) => x.id === id);
  if (i < 0) return { ok: false, error: 'NOT_FOUND' };
  const s = normalizeSource({ ...cur.sources[i], ...(input as object), id });
  const next = [...cur.sources];
  next[i] = s;
  return write(next, opts);
}

/** 目前資料中引用此來源的筆數（優惠、商品、組合優惠價、知識庫） */
export function sourceReferences(id: string): { promos: number; products: number; bundles: number; kb: number; total: number } {
  const promos = loadPromos().filter((x) => x.source_id === id).length;
  const products = loadProducts().filter((x) => x.source_id === id).length;
  const bundles = loadBundles().filter((x) => x.source_id === id).length;
  const kb = loadKb().filter((x) => x.source_id === id).length;
  return { promos, products, bundles, kb, total: promos + products + bundles + kb };
}

/** 有引用的來源拒絕刪除，建議改為停用 */
export function deleteSource(id: string, opts: Opts & { refs?: (id: string) => number } = {}): SourcesResult {
  const cur = loadSourcesFile(opts);
  if (!cur.ok) return cur;
  if (!cur.sources.some((x) => x.id === id)) return { ok: false, error: 'NOT_FOUND' };
  const refs = opts.refs ? opts.refs(id) : sourceReferences(id).total;
  if (refs > 0) return { ok: false, error: 'SOURCE_IN_USE', errors: [`有 ${refs} 筆資料引用此來源，不可刪除，請改為停用`] };
  return write(cur.sources.filter((x) => x.id !== id), opts);
}
