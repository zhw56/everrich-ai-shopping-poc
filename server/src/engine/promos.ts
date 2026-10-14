import { CHANNEL_LABEL, isListed, loadPromos, type Channel, type Promo } from '../data.js';
import { addDays, daysBetween, isExpired, PREORDER_DAYS } from './dates.js';
import { round1 } from './purchases.js';
import { getWeights, type Weights } from './weights.js';

export type BasketLine = { category: string; amount: number };

export type TripInfo = { date: string } | null;

export type PointsInfo = { points: number; expire_date: string; expiring: number } | null;

export type PromoRecInput = {
  as_of: string;
  basket: BasketLine[];
  channel: Channel;
  member_tier?: string | null;
  trip?: TripInfo;
  points?: PointsInfo;
  top_n?: number;
  weights?: Weights;
};

const REQUIREMENT_LABEL: Record<Promo['requirement'], string> = { none: '不限身分', member: 'RICHCLUB 會員', card: '昇恆昌聯名卡結帳', app: '昇恆昌 App 任務' };

export function summarizePromo(p: Promo) {
  return {
    id: p.id,
    name: p.name,
    channel: p.channel,
    channel_label: CHANNEL_LABEL[p.channel],
    promo_type: p.promo_type,
    label: p.label,
    condition_label: p.condition_label,
    requirement: p.requirement,
    requirement_label: REQUIREMENT_LABEL[p.requirement],
    min_spend: p.min_spend,
    discount_rate: p.discount_rate,
    discount_amount: p.discount_amount,
    max_discount: p.max_discount,
    points: p.points,
    categories: p.categories,
    exclude_categories: p.exclude_categories,
    member_tiers: p.member_tiers,
    valid_from: p.valid_from,
    valid_to: p.valid_to,
    source_url: p.source_url,
    mock: p.mock,
    verified: p.verified,
  };
}

/** 優惠適用的消費金額：依適用分類與排除分類加總 */
export function eligibleAmount(p: Promo, basket: BasketLine[]): number {
  return basket
    .filter((b) => (!p.categories.length || p.categories.includes(b.category)) && !p.exclude_categories.includes(b.category))
    .reduce((s, b) => s + b.amount, 0);
}

/**
 * 單一優惠在這筆消費的效果：
 * - rate：適用金額 × 折扣（有上限時取上限）
 * - threshold：適用金額達門檻才折，未達時回報還差多少
 * - rebate：結帳不折價，事後以點數回饋，回報預估回饋金額
 * - points：送固定點數，不折現
 */
export function promoEffect(p: Promo, basket: BasketLine[]) {
  const total = basket.reduce((s, b) => s + b.amount, 0);
  const eligible = eligibleAmount(p, basket);
  let discount = 0;
  let rebate = 0;
  let gap = 0;
  if (p.promo_type === 'rate' && p.discount_rate) {
    discount = Math.round(eligible * p.discount_rate);
    if (p.max_discount !== null) discount = Math.min(discount, p.max_discount);
  } else if (p.promo_type === 'threshold' && p.discount_amount) {
    if (eligible >= p.min_spend) discount = p.discount_amount;
    else gap = p.min_spend - eligible;
  } else if (p.promo_type === 'rebate' && p.discount_rate) {
    rebate = Math.round(eligible * p.discount_rate);
    if (p.max_discount !== null) rebate = Math.min(rebate, p.max_discount);
  }
  return { total, eligible_amount: eligible, discount, rebate, points: p.points ?? 0, gap_to_threshold: gap, pay_amount: total - discount };
}

const EASE: Record<Promo['requirement'], number> = { none: 100, member: 80, app: 60, card: 50 };

export function recommendPromos(input: PromoRecInput) {
  const w = input.weights ?? getWeights();
  const tier = input.member_tier ?? null;
  const trip = input.trip ?? null;
  // 免稅店的優惠要在出發當天還有效才用得到；宅配網以今天為準
  const useDate = input.channel === 'dutyfree' && trip ? trip.date : input.as_of;
  const cats = new Set(input.basket.map((b) => b.category));
  const excluded: { id: string; name: string; reason: string }[] = [];

  const pool = loadPromos().filter((p) => {
    if (!isListed(p)) return false;
    if (p.channel !== 'all' && p.channel !== input.channel) return false;
    const out = (reason: string) => (excluded.push({ id: p.id, name: p.name, reason }), false);
    if (isExpired(p.valid_to, input.as_of)) return out('expired');
    if (isExpired(p.valid_to, useDate)) return out('ends_before_trip');
    if (p.valid_from && p.valid_from > useDate) return out('not_started_on_trip');
    if (p.member_tiers.length && (!tier || !p.member_tiers.includes(tier))) return out('tier_not_eligible');
    if (p.categories.length && !p.categories.some((c) => cats.has(c))) return out('category_mismatch');
    return true;
  });

  const tripOption = trip
    ? (() => {
        const opens = addDays(trip.date, -PREORDER_DAYS);
        return {
          trip_date: trip.date,
          days_to_trip: daysBetween(input.as_of, trip.date),
          preorder_opens: opens,
          preorder_open_now: input.as_of >= opens,
          ending_before_trip: excluded.filter((x) => x.reason === 'ends_before_trip').map((x) => x.name),
        };
      })()
    : null;
  const pointsOption = input.points
    ? {
        points: input.points.points,
        expire_date: input.points.expire_date,
        expiring: input.points.expiring,
        days_to_expire: daysBetween(input.as_of, input.points.expire_date),
        expires_before_trip: !!trip && input.points.expiring > 0 && input.points.expire_date < trip.date,
      }
    : null;

  const base = {
    as_of: input.as_of,
    channel: input.channel,
    channel_label: CHANNEL_LABEL[input.channel],
    basket: input.basket,
    basket_total: input.basket.reduce((s, b) => s + b.amount, 0),
    member_tier: tier,
    weights: w,
    trip_option: tripOption,
    points_option: pointsOption,
    excluded,
  };
  if (!pool.length) return { ...base, items: [] };

  const effects = pool.map((p) => ({ p, e: promoEffect(p, input.basket) }));
  const maxValue = Math.max(...effects.map(({ e }) => e.discount + e.rebate), 0);

  const items = effects.map(({ p, e }) => {
    const value = e.discount + e.rebate;
    const saving = maxValue ? (value / maxValue) * 100 : 50;
    const fit = e.total ? (e.eligible_amount / e.total) * 100 : 0;
    const ease = p.requirement === 'member' && tier ? 100 : EASE[p.requirement];
    const score = round1(saving * w.saving + fit * w.fit + ease * w.ease);
    const reasons: string[] = [`適用金額 ${e.eligible_amount.toLocaleString('en-US')} 元`];
    if (e.discount) reasons.push(`結帳可折 ${e.discount.toLocaleString('en-US')} 元`);
    if (e.rebate) reasons.push(`預估回饋 ${e.rebate.toLocaleString('en-US')} 元（以點數發放）`);
    if (e.points) reasons.push(`送 ${e.points.toLocaleString('en-US')} RICH POINT`);
    if (e.gap_to_threshold) reasons.push(`還差 ${e.gap_to_threshold.toLocaleString('en-US')} 元達滿額門檻`);
    if (p.requirement !== 'none') reasons.push(`需要${REQUIREMENT_LABEL[p.requirement]}`);
    if (p.exclude_categories.some((c) => cats.has(c))) reasons.push(`${p.exclude_categories.filter((c) => cats.has(c)).join('、')}不列入計算`);
    return {
      promo: summarizePromo(p),
      score,
      breakdown: { saving: round1(saving), fit: round1(fit), ease },
      effect: e,
      reasons,
    };
  });

  items.sort((a, b) => b.score - a.score || b.effect.discount - a.effect.discount);
  return { ...base, items: items.slice(0, input.top_n ?? 3) };
}

/** 未驗證時用戶自己說的預算與想買的分類，平均分配成購物籃 */
export function basketFromManual(amount: number, categories: string[]): BasketLine[] {
  const list = categories.length ? categories : ['美妝保養'];
  const each = Math.floor(amount / list.length);
  return list.map((category, i) => ({ category, amount: i === 0 ? amount - each * (list.length - 1) : each }));
}
