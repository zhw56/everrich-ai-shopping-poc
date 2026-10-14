import { CATEGORIES, loadBundles, loadProducts, loadPromos, loadSources, loadUsers, TIERS, type Bundle, type Product, type Promo } from '../data.js';
import { toJson } from '../util/atomic.js';
import { validateAndWrite } from './validateData.js';

/** T13：優惠活動、商品、組合優惠價的後台編輯。官網數字被改動或新增時，自動標成展示資料（mock）並記入 mock_fields */
export type Kind = 'promos' | 'products' | 'bundles';
export const KINDS: Kind[] = ['promos', 'products', 'bundles'];
type Row = (Promo | Product | Bundle) & Record<string, any>;
type Listed = Record<string, any> & { id: string; refs: { users: number; bundles: number } };
type Result = { ok: true; rows: Listed[] } | { ok: false; error: string; errors: string[] };

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
const load = (k: Kind): Row[] => (k === 'promos' ? loadPromos() : k === 'products' ? loadProducts() : loadBundles()) as Row[];
const isDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const money = (v: unknown) => Number.isInteger(v) && (v as number) >= 0;
const strList = (v: any) => (Array.isArray(v) ? v.map((t) => String(t).trim()).filter(Boolean) : []);
const numOrNull = (v: any) => (v === null || v === '' || v === undefined ? null : Number(v));

/** 會被當成官網事實的欄位：改了就列入 mock_fields */
const TRACKED: Record<Kind, string[]> = {
  promos: ['discount_rate', 'max_discount', 'min_spend', 'discount_amount', 'points', 'categories', 'exclude_categories', 'member_tiers', 'requirement', 'valid_from', 'valid_to'],
  products: ['price', 'home_price', 'tags'],
  bundles: ['bundle_price', 'gift', 'valid_from', 'valid_to'],
};
/** 可編輯欄位與型別轉換 */
const EDITABLE: Record<Kind, Record<string, (v: any) => unknown>> = {
  promos: {
    name: String, channel: String, promo_type: String, discount_rate: numOrNull, max_discount: numOrNull, min_spend: Number,
    discount_amount: numOrNull, points: numOrNull, categories: strList, exclude_categories: strList, member_tiers: strList,
    requirement: String, valid_from: (v) => v || null, valid_to: (v) => v || null, label: String, condition_label: String,
    source_id: String, note: String, listed: Boolean,
  },
  products: {
    name: String, brand: String, category: String, price: Number, home_price: numOrNull, size_label: String,
    alcohol_ml: numOrNull, tags: strList, source_id: String, note: String, listed: Boolean,
  },
  bundles: {
    product_id: String, promo_id: String, channel: String, bundle_price: Number, gift: (v) => (v ? String(v) : null),
    valid_from: (v) => v || null, valid_to: (v) => v || null, source_id: String, note: String, listed: Boolean,
  },
};

/** 被其他資料引用的筆數（刪除前檢查） */
export function references(kind: Kind, id: string): { users: number; bundles: number } {
  const users = loadUsers().users;
  if (kind === 'promos') return { users: 0, bundles: loadBundles().filter((b) => b.promo_id === id).length };
  if (kind === 'products')
    return {
      users: users.filter((u) => u.favorite_product_id === id || u.orders.some((o) => o.items.some((i) => i.product_id === id))).length,
      bundles: loadBundles().filter((b) => b.product_id === id).length,
    };
  return { users: 0, bundles: 0 };
}

export function listRows(kind: Kind): Listed[] {
  return load(kind).map((r) => ({ ...r, listed: r.listed !== false, refs: references(kind, r.id) }));
}

function fieldErrors(kind: Kind, r: Row): string[] {
  const e: string[] = [];
  const src = loadSources().find((s) => s.id === r.source_id);
  const okTypes = kind === 'products' ? ['product'] : ['promo', 'faq'];
  if (!src) e.push('請選擇資料來源');
  else if (!okTypes.includes(src.type)) e.push(`來源分類必須是 ${okTypes.join(' 或 ')}`);
  if (r.valid_from && !isDate(r.valid_from)) e.push('開始日格式為 YYYY-MM-DD');
  if (r.valid_to && !isDate(r.valid_to)) e.push('截止日格式為 YYYY-MM-DD');
  if (r.valid_from && r.valid_to && r.valid_from > r.valid_to) e.push('開始日不可晚於截止日');
  if (typeof r.note !== 'string' || !r.note.trim()) e.push('說明必填');
  const cats = CATEGORIES as readonly string[];
  if (kind === 'promos') {
    if (!r.name?.trim() || r.name.length > 40) e.push('活動名稱必填，40 字內');
    if (!['dutyfree', 'home', 'all'].includes(r.channel)) e.push('通路必須是免稅店、宅配網或兩者');
    if (!['rate', 'threshold', 'points', 'rebate'].includes(r.promo_type)) e.push('優惠類型無效');
    if (['rate', 'rebate'].includes(r.promo_type) && !(typeof r.discount_rate === 'number' && r.discount_rate > 0 && r.discount_rate < 1)) e.push('折扣比例需介於 0 到 1（例如 0.1 代表 9 折）');
    if (r.promo_type === 'threshold' && !(money(r.discount_amount) && r.discount_amount > 0)) e.push('滿額折需填折抵金額');
    if (r.promo_type === 'points' && !(money(r.points) && r.points > 0)) e.push('送點數活動需填點數');
    if (!money(r.min_spend)) e.push('門檻金額必須是 0 以上的整數');
    if (r.max_discount !== null && !money(r.max_discount)) e.push('折扣上限必須是 0 以上的整數或空白');
    if (![...r.categories, ...r.exclude_categories].every((c: string) => cats.includes(c))) e.push('商品分類無效');
    if (!r.member_tiers.every((t: string) => (TIERS as readonly string[]).includes(t))) e.push('會員等級無效');
    if (!['none', 'member', 'card', 'app'].includes(r.requirement)) e.push('使用條件無效');
    if (!r.label?.trim() || !r.condition_label?.trim()) e.push('優惠內容與適用條件文字必填');
  } else if (kind === 'products') {
    if (!r.name?.trim() || r.name.length > 60) e.push('商品名稱必填，60 字內');
    if (!r.brand?.trim()) e.push('品牌必填');
    if (!cats.includes(r.category)) e.push('請選擇商品分類');
    if (!money(r.price)) e.push('免稅價必須是 0 以上的整數');
    if (r.home_price !== null && !money(r.home_price)) e.push('宅配價必須是 0 以上的整數，或留空代表宅配網不販售');
    if (r.category === '酒類' && !(money(r.alcohol_ml) && r.alcohol_ml > 0)) e.push('酒類需填容量（ml）');
    if (!r.size_label?.trim()) e.push('規格必填，例如 100ml');
    if (!r.tags?.length) e.push('至少一個標籤');
  } else {
    const promo = loadPromos().find((p) => p.id === r.promo_id);
    const product = loadProducts().find((d) => d.id === r.product_id);
    if (!product) e.push('請選擇商品');
    if (!promo) e.push('請選擇優惠');
    if (!['dutyfree', 'home'].includes(r.channel)) e.push('通路必須是免稅店或宅配網');
    if (product && r.channel === 'home' && product.home_price === null) e.push('這件商品宅配網不販售');
    if (promo && promo.channel !== 'all' && promo.channel !== r.channel) e.push('優惠的通路與組合不一致');
    if (!money(r.bundle_price)) e.push('優惠價必須是 0 以上的整數');
    if (loadBundles().some((b) => b.id !== r.id && b.product_id === r.product_id && b.promo_id === r.promo_id && b.channel === r.channel)) e.push('這件商品與優惠的組合已存在');
  }
  return e;
}

function nextId(kind: Kind, rows: Row[]): string {
  const base = kind === 'bundles' ? 'mock-bundle-' : kind === 'promos' ? 'promo-custom-' : 'prod-custom-';
  const nums = rows.map((x) => Number(x.id.startsWith(base) ? x.id.slice(base.length) : NaN)).filter(Number.isFinite);
  const n = (nums.length ? Math.max(...nums) : 0) + 1;
  return base + String(n).padStart(2, '0');
}

function write(kind: Kind, rows: Row[]): Result {
  const r = validateAndWrite({ [`${kind}.json`]: toJson(rows.map(({ refs, ...x }: any) => x)) });
  return r.ok ? { ok: true, rows: listRows(kind) } : r;
}

/** 新增（id 為 null）或修改一筆 */
export function saveRow(kind: Kind, id: string | null, input: Record<string, unknown>): Result {
  const rows = load(kind);
  const idx = id ? rows.findIndex((x) => x.id === id) : -1;
  if (id && idx < 0) return { ok: false, error: 'NOT_FOUND', errors: ['找不到這筆資料'] };
  const before: Row | null = idx >= 0 ? rows[idx] : null;
  const patch: Record<string, unknown> = {};
  for (const [k, conv] of Object.entries(EDITABLE[kind])) if (Object.hasOwn(input ?? {}, k)) patch[k] = conv((input as any)[k]);

  const DEFAULTS: Record<Kind, Record<string, unknown>> = {
    promos: { valid_from: null, valid_to: null, discount_rate: null, max_discount: null, min_spend: 0, discount_amount: null, points: null, categories: [], exclude_categories: [], member_tiers: [], requirement: 'member', listed: true },
    products: { home_price: null, alcohol_ml: null, listed: true },
    bundles: { gift: null, valid_from: null, valid_to: null, listed: true },
  };
  let row: Row = { ...(before ?? DEFAULTS[kind]), ...patch } as Row;
  if (kind === 'products') row.channels = ['dutyfree', ...(row.home_price !== null && row.home_price !== undefined ? ['home'] : [])];
  if (kind === 'bundles') {
    const promo = loadPromos().find((p) => p.id === row.promo_id);
    if (promo && !Object.hasOwn(patch, 'source_id')) row.source_id = promo.source_id;
  }
  const src = loadSources().find((s) => s.id === row.source_id);
  if (src) row.source_url = src.url;

  if (!before) {
    row = {
      ...row,
      id: nextId(kind, rows),
      verified: false,
      mock: true,
      mock_fields: TRACKED[kind].filter((f) => Object.hasOwn(row, f)),
      unknown_fields: [],
      ...(kind !== 'bundles' ? { last_checked: today() } : {}),
      ...(kind === 'products' ? { price_kind: 'mock' } : {}),
    } as Row;
    row.note = `後台新增的展示資料。${row.note ?? ''}`.trim();
  } else {
    const changed = TRACKED[kind].filter((f) => Object.hasOwn(patch, f) && JSON.stringify(patch[f]) !== JSON.stringify(before[f]));
    if (changed.length) {
      row.mock = true;
      row.mock_fields = [...new Set([...(before.mock_fields ?? []), ...changed])];
      // 改過的欄位不再是未知值
      row.unknown_fields = (before.unknown_fields ?? []).filter((f: string) => !changed.includes(f));
      if (kind === 'products' && (changed.includes('price') || changed.includes('home_price'))) row.price_kind = 'mock';
      if (!String(row.note).includes('後台修改')) row.note = `${row.note}（後台修改過的欄位以展示資料標示）`;
    }
  }
  // 未知欄位必須維持 null；後台填了值就不再算未知
  row.unknown_fields = (row.unknown_fields ?? []).filter((f: string) => row[f] === null);
  if (kind === 'bundles') row.mock = true;
  row.verified = false;

  const errors = fieldErrors(kind, row);
  if (errors.length) return { ok: false, error: 'INVALID', errors };
  if (before) rows[idx] = row;
  else rows.push(row);
  return write(kind, rows);
}

export function setListed(kind: Kind, id: string, listed: boolean): Result {
  const rows = load(kind);
  const row = rows.find((x) => x.id === id);
  if (!row) return { ok: false, error: 'NOT_FOUND', errors: ['找不到這筆資料'] };
  row.listed = listed;
  return write(kind, rows);
}

export function deleteRow(kind: Kind, id: string): Result {
  const rows = load(kind);
  if (!rows.some((x) => x.id === id)) return { ok: false, error: 'NOT_FOUND', errors: ['找不到這筆資料'] };
  const refs = references(kind, id);
  if (refs.users || refs.bundles) return { ok: false, error: 'IN_USE', errors: [`仍被 ${refs.users} 位展示會員、${refs.bundles} 組優惠價引用，請改為下架`] };
  return write(kind, rows.filter((x) => x.id !== id));
}
