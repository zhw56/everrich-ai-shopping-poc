import { asOfDate, loadUsers, type Channel } from '../data.js';
import { basketFromManual, recommendPromos, summarizePurchases, type Weights } from '../engine/index.js';

export type PreviewTarget = { user_id?: string; manual?: { amount: number; categories: string[]; channel?: Channel } };

/** 推薦規則頁的即時預覽：用展示會員（預設 S2 會員 A）或自訂預算跑優惠推薦引擎，不寫檔 */
export function previewRanking(weights?: Weights, target: PreviewTarget = {}) {
  const asOf = asOfDate();
  if (target.manual) {
    const m = target.manual;
    const channel = m.channel ?? 'dutyfree';
    const r = recommendPromos({ as_of: asOf, basket: basketFromManual(m.amount, m.categories), channel, weights, top_n: 5 });
    return { label: `自訂：${channel === 'home' ? '宅配網' : '免稅店'}預算 ${m.amount.toLocaleString('en-US')} 元，${m.categories.join('、') || '不限分類'}`, items: items(r) };
  }
  const id = target.user_id ?? 'mock-user-a';
  const u = loadUsers().users.find((x) => x.id === id);
  if (!u) return null;
  const s = summarizePurchases(u.purchases);
  const amount = s.avg_per_trip || s.avg_monthly;
  const top = s.top_categories.slice(0, 3);
  const sum = top.reduce((a, c) => a + c.amount, 0) || 1;
  const basket = top.map((c) => ({ category: c.category, amount: Math.round((amount * c.amount) / sum) }));
  const r = recommendPromos({
    as_of: asOf,
    basket,
    channel: u.preferred_channel,
    member_tier: u.member_tier,
    trip: u.next_trip ? { date: u.next_trip.date } : null,
    weights,
    top_n: 5,
  });
  return { label: `${u.name}（${u.member_tier}）：每趟平均 ${amount.toLocaleString('en-US')} 元，常買 ${top.map((c) => c.category).join('、')}`, items: items(r) };
}

function items(r: ReturnType<typeof recommendPromos>) {
  return r.items.map((x, i) => ({ rank: i + 1, id: x.promo.id, name: x.promo.name, label: x.promo.label, score: x.score, saving: x.effect.discount + x.effect.rebate, gap: x.effect.gap_to_threshold }));
}
