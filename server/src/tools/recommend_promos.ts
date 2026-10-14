import { asOfDate, CATEGORIES, loadPromos, normalizeCategories, type Channel } from '../data.js';
import { basketFromManual, recommendPromos, summarizePurchases } from '../engine/index.js';
import type { Tool } from '../types.js';
import { MOCK_NOTICE, requireVerifiedUser, sourcesFrom } from './_common.js';

type Input = {
  manual_basket?: { amount: number; categories: string[] };
  channel?: Channel;
  top_n?: number;
};

export const recommendPromosTool: Tool<Input> = {
  definition: {
    name: 'recommend_promos',
    description:
      '由推薦引擎計算這次購物最划算的優惠前幾名：每個優惠可折多少、預估回饋、還差多少達門檻與推薦理由要素。已驗證會員不需提供消費資料，會自動讀取會員等級、近 6 個月常買分類與每趟平均消費、下一趟出發日與點數到期日，並排除出發前就結束的活動；用戶有說這次的預算或想買的東西時，請帶 manual_basket。未驗證時必須提供 manual_basket。',
    input_schema: {
      type: 'object',
      properties: {
        manual_basket: {
          type: 'object',
          description: '這次預計的消費：總預算與想買的分類',
          properties: {
            amount: { type: 'integer', description: '預計消費總額（元）' },
            categories: { type: 'array', items: { type: 'string', enum: [...CATEGORIES] } },
          },
          required: ['amount', 'categories'],
        },
        channel: { type: 'string', enum: ['dutyfree', 'home'], description: '預設：會員偏好通路；未驗證時為 dutyfree' },
        top_n: { type: 'integer', minimum: 1, maximum: 5 },
      },
    },
  },
  async run(i, ctx) {
    const asOf = asOfDate();
    const manual = i.manual_basket && Number(i.manual_basket.amount) > 0 ? i.manual_basket : null;
    const auth = requireVerifiedUser(ctx);
    if (!manual && 'error' in auth) return { ok: false, error: auth.error.error === 'NEED_VERIFY' ? 'NEED_VERIFY_OR_MANUAL_BASKET' : auth.error.error };
    const u = 'user' in auth ? auth.user : null;
    const channel: Channel = i.channel ?? u?.preferred_channel ?? 'dutyfree';
    let basket;
    let basis: Record<string, unknown>;
    if (manual) {
      const cats = normalizeCategories(manual.categories);
      basket = basketFromManual(Math.round(manual.amount), cats);
      basis = { source: 'manual', amount: Math.round(manual.amount), categories: cats };
    } else {
      const summary = summarizePurchases(u!.purchases);
      const amount = summary.avg_per_trip || summary.avg_monthly;
      const top = summary.top_categories.slice(0, 3);
      const sum = top.reduce((s, c) => s + c.amount, 0) || 1;
      basket = top.map((c) => ({ category: c.category, amount: Math.round((amount * c.amount) / sum) }));
      basis = { source: 'purchase_history', avg_per_trip: summary.avg_per_trip, trips: summary.trips, top_categories: top.map((c) => c.category) };
    }
    const result = recommendPromos({
      as_of: asOf,
      basket,
      channel,
      member_tier: u?.member_tier ?? null,
      trip: u?.next_trip ? { date: u.next_trip.date } : null,
      points: u ? { points: u.points, expire_date: u.points_expire_date, expiring: u.points_expiring } : null,
      top_n: i.top_n,
    });
    const promos = loadPromos();
    const used = result.items.map((x) => promos.find((p) => p.id === x.promo.id)!).filter(Boolean);
    return { ok: true, data: { ...result, basket_basis: basis, notice: MOCK_NOTICE }, sources: sourcesFrom(used) };
  },
};
