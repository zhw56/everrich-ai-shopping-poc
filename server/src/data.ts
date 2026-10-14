import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** 每次呼叫都重新讀檔，後台修改資料後立即生效 */
export const DATA_DIR = fileURLToPath(new URL('../../data/', import.meta.url));

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(DATA_DIR + name, 'utf8')) as T;
}

export type Channel = 'dutyfree' | 'home';
export const CHANNEL_LABEL: Record<Channel | 'all', string> = { dutyfree: '免稅店', home: '宅配網', all: '免稅店與宅配網' };
export const CATEGORIES = ['美妝保養', '香水', '酒類', '精品配件', '食品伴手禮'] as const;
export const TIERS = ['初心者', '探索者', '創造者', '領航者'] as const;

/** 把模型或用戶寫的分類（例如「保養品」「美妍保養」「威士忌」）對應到正式分類；對不上回 null */
export function normalizeCategory(raw: unknown): string | null {
  const t = String(raw ?? '').trim();
  if (!t) return null;
  if ((CATEGORIES as readonly string[]).includes(t)) return t;
  if (/香水|香氛|淡香|古龍/.test(t)) return '香水';
  if (/保養|美妝|美妍|彩妝|精華|乳霜|面霜|保濕|化妝/.test(t)) return '美妝保養';
  if (/酒|威士忌|香檳|紅酒|白蘭地|清酒/.test(t)) return '酒類';
  if (/精品|配件|皮夾|皮件|長夾|包|眼鏡|手錶|飾品/.test(t)) return '精品配件';
  if (/伴手|食品|茶|零食|巧克力|鳳梨酥|糕點|點心/.test(t)) return '食品伴手禮';
  return null;
}
export const normalizeCategories = (list: unknown): string[] =>
  [...new Set((Array.isArray(list) ? list : list ? [list] : []).map(normalizeCategory).filter((x): x is string => !!x))];

/** 優惠活動（data/promos.json）：折扣％（rate）、滿額折（threshold）、送點數（points）、點數回饋（rebate） */
export type Promo = {
  id: string;
  name: string;
  channel: Channel | 'all';
  promo_type: 'rate' | 'threshold' | 'points' | 'rebate';
  discount_rate: number | null;
  max_discount: number | null;
  min_spend: number;
  discount_amount: number | null;
  points: number | null;
  categories: string[];
  exclude_categories: string[];
  member_tiers: string[];
  requirement: 'none' | 'member' | 'card' | 'app';
  valid_from: string | null;
  valid_to: string | null;
  label: string;
  condition_label: string;
  source_id: string;
  source_url: string;
  verified: boolean;
  mock: boolean;
  note: string;
  listed?: boolean;
  mock_fields?: string[];
};

/** 商品（data/products.json）：price 為免稅價；home_price 為宅配網價格，null 代表宅配網不販售 */
export type Product = {
  id: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  home_price: number | null;
  price_kind: string;
  channels: Channel[];
  size_label: string;
  alcohol_ml: number | null;
  tags: string[];
  source_id: string;
  source_url: string;
  verified: boolean;
  mock: boolean;
  note: string;
  listed?: boolean;
  mock_fields?: string[];
};

/** 組合優惠價（data/bundles.json）：單一商品套用單一優惠後的結帳價 */
export type Bundle = {
  id: string;
  product_id: string;
  promo_id: string;
  channel: Channel;
  bundle_price: number;
  gift: string | null;
  valid_from: string | null;
  valid_to: string | null;
  source_id: string;
  source_url: string;
  verified: boolean;
  mock: boolean;
  note: string;
  listed?: boolean;
  mock_fields?: string[];
};

export type PurchaseRow = { month: string; dutyfree_amount: number; home_amount: number; trips: number; categories: Record<string, number> };
export type OrderItem = { code: string; name: string; amount: number; product_id?: string };
export type Order = {
  order_no: string;
  channel: Channel;
  created_date: string;
  status: string;
  pickup_label: string;
  items: OrderItem[];
  total: number;
  mock?: boolean;
  verified?: boolean;
};
export type Trip = { date: string; airport: string; terminal: string; destination: string; flight: string };

/** 展示會員（data/users_mock.json） */
export type User = {
  id: string;
  name: string;
  phone: string;
  member_tier: string;
  points: number;
  points_expire_date: string;
  points_expiring: number;
  joined_date: string;
  birthday_month: number;
  favorite_product_id: string;
  preferred_channel: Channel;
  next_trip: Trip | null;
  purchases: PurchaseRow[];
  orders: Order[];
  mock: boolean;
  verified: boolean;
};

export type SourceEntry = {
  id: string;
  type: 'promo' | 'product' | 'faq';
  title: string;
  url: string;
  enabled: boolean;
  last_checked: string | null;
  note: string;
};

export type KbEntry = {
  id: string;
  title: string;
  source_id: string;
  source_url: string;
  last_checked: string | null;
  valid_to: string | null;
  verified: boolean;
  mock: boolean;
  body: string;
};

/** 後台上下架：listed 為 false 的資料不參與查詢與推薦，但既有會員與組合關聯仍可查到 */
export const isListed = (x: { listed?: boolean }) => x.listed !== false;

export const loadPromos = () => readJson<Promo[]>('promos.json');
export const loadProducts = () => readJson<Product[]>('products.json');
export const loadBundles = () => readJson<Bundle[]>('bundles.json');
export const loadSources = () => readJson<SourceEntry[]>('sources.json');
export const loadUsers = () => readJson<{ as_of: string; users: User[] }>('users_mock.json');

/** 展示與評測共用的基準日，避免日後執行時情境漂移 */
export const asOfDate = () => loadUsers().as_of;

export function sourceTitle(sourceId: string, fallback: string): string {
  return loadSources().find((s) => s.id === sourceId)?.title ?? fallback;
}

const NL = String.fromCharCode(10);

export function loadKb(): KbEntry[] {
  const text = readFileSync(DATA_DIR + 'kb.md', 'utf8');
  return text
    .split(NL + '## ')
    .slice(1)
    .map((block) => {
      const lines = block.split(NL);
      const [id, ...titleParts] = lines[0].split('｜');
      const meta: Record<string, string> = {};
      const body: string[] = [];
      for (const line of lines.slice(1)) {
        const m = line.match(/^- ([a-z_]+): (.*)$/);
        if (m) meta[m[1]] = m[2].trim();
        else if (line.trim()) body.push(line.trim());
      }
      const nullable = (v?: string) => (!v || v === 'null' ? null : v);
      return {
        id: id.trim(),
        title: titleParts.join('｜').trim(),
        source_id: meta.source_id ?? '',
        source_url: meta.source_url ?? '',
        last_checked: nullable(meta.last_checked),
        valid_to: nullable(meta.valid_to),
        verified: meta.verified === 'true',
        mock: meta.mock === 'true',
        body: body.join(' '),
      };
    });
}
