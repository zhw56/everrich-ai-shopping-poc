import { asOfDate } from '../data.js';
import type { Profile } from './schema.js';

/** 客群標籤：由畫像屬性以程式規則計算（可解釋、可重現），供分眾、名單與 NBA 規則使用 */
export const SEGMENTS: { id: string; label: string; desc: string; test: (p: Profile) => boolean }[] = [
  { id: 'beauty_lover', label: '美妝香氛客', desc: '對美妝保養或香水有興趣', test: (p) => hasAny(list(p, 'category_interest'), ['美妝保養', '香水']) || p.topics.includes('美妝') },
  { id: 'liquor_buyer', label: '酒類買家', desc: '對酒類有興趣，或常買品牌是酒', test: (p) => list(p, 'category_interest').includes('酒類') || /威士忌|香檳|酒/.test(String(v(p, 'favorite_product') ?? '')) || p.topics.includes('菸酒額度') },
  { id: 'gift_shopper', label: '送禮需求', desc: '有送禮對象', test: (p) => list(p, 'gift_for').length > 0 },
  { id: 'souvenir', label: '伴手禮客', desc: '對食品伴手禮或台灣品牌有興趣', test: (p) => list(p, 'category_interest').includes('食品伴手禮') || list(p, 'product_priorities').includes('台灣品牌') },
  { id: 'luxury', label: '精品客', desc: '對精品配件有興趣，或這次預算 ≥ 30,000', test: (p) => list(p, 'category_interest').includes('精品配件') || n(p, 'budget_total', 0) >= 30000 },
  { id: 'price_sensitive', label: '價格敏感', desc: '價格敏感度高，或單件預算 ≤ 2,000', test: (p) => v(p, 'price_sensitivity') === '高' || n(p, 'budget_item') <= 2000 },
  { id: 'high_tier', label: '高等級會員', desc: '創造者或領航者會員（會員資料）', test: (p) => ['創造者', '領航者'].includes(String(v(p, 'member_tier') ?? '')) },
  { id: 'non_member', label: '非會員潛客', desc: '表明不是 RICHCLUB 會員', test: (p) => v(p, 'is_member') === false },
  { id: 'trip_soon', label: '近期出國', desc: '14 天內出發', test: (p) => { const d = daysTo(v(p, 'next_trip') ?? v(p, 'trip_date')); return d >= 0 && d <= 14; } },
  { id: 'trip_far', label: '出發日尚遠', desc: '45 天後才出發（還不能預購）', test: (p) => daysTo(v(p, 'next_trip') ?? v(p, 'trip_date')) > 45 && Number.isFinite(daysTo(v(p, 'next_trip') ?? v(p, 'trip_date'))) },
  { id: 'points_expiring', label: '點數將到期', desc: '點數 30 天內到期（會員資料）', test: (p) => { const d = daysTo(v(p, 'points_expire')); return d >= 0 && d <= 30; } },
  { id: 'home_shopper', label: '宅配族', desc: '想寄到家、不出國購買', test: (p) => v(p, 'shopping_channel') === '宅配到府' },
  { id: 'frequent_traveler', label: '常出國', desc: '每月或每季出國', test: (p) => ['每月', '每季'].includes(String(v(p, 'travel_frequency'))) || v(p, 'customer_type') === '商務旅客' },
  { id: 'family_trip', label: '家庭出遊', desc: '家庭旅遊或同行 3 人以上', test: (p) => v(p, 'customer_type') === '家庭旅遊' || n(p, 'party_size', 0) >= 3 },
  { id: 'unhappy', label: '不滿意風險', desc: '情緒負向，或意圖為流失風險', test: (p) => p.sentiment === '負向' || p.intent_stage === '流失風險' },
  { id: 'ready_to_buy', label: '高購買意圖', desc: '意圖階段為準備購買', test: (p) => p.intent_stage === '準備購買' },
];

const v = (p: Profile, k: string) => p.attributes[k]?.value;
const n = (p: Profile, k: string, d = Number.POSITIVE_INFINITY) => (typeof v(p, k) === 'number' ? (v(p, k) as number) : d);
const list = (p: Profile, k: string) => (Array.isArray(v(p, k)) ? (v(p, k) as string[]) : []);
const hasAny = (xs: string[], ys: string[]) => xs.some((x) => ys.includes(x));
function daysTo(d: unknown): number {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(d)) return Number.NaN;
  return (Date.parse(d.slice(0, 10)) - Date.parse(asOfDate())) / 86400000;
}

export function segmentsOf(p: Profile): string[] {
  return SEGMENTS.filter((s) => s.test(p)).map((s) => s.id);
}
export const SEGMENT_LABEL = new Map(SEGMENTS.map((s) => [s.id, s.label]));
