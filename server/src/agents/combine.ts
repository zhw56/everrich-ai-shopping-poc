import type { BundleCost } from '../engine/bundles.js';

export type Combo = BundleCost & { reason: string };

/**
 * 從商品專員的優惠價報價與優惠專員的推薦排名，挑出最多 n 組「商品＋優惠」。
 * 只做挑選與排序，價格與省下金額一律沿用 get_promo_price（引擎）的計算結果。
 * 規則：先讓每件推薦商品各出一組（優惠推薦名次高者優先，同名次取結帳價低者），不足 n 組再從剩下的組合補齊。
 */
export type RankedPromo = { id: string };

export function pickCombos(options: BundleCost[], productOrder: string[], promoOrder: RankedPromo[], n = 3): Combo[] {
  const unique = [...new Map(options.map((o) => [o.bundle_id, o])).values()];
  const rank = (o: BundleCost) => {
    const i = promoOrder.findIndex((p) => p.id === o.promo.id);
    return i >= 0 ? i : 99;
  };
  const cmp = (a: BundleCost, b: BundleCost) => rank(a) - rank(b) || a.bundle_price - b.bundle_price;
  const prodRank = (id: string) => {
    const i = productOrder.indexOf(id);
    return i < 0 ? 99 : i;
  };
  const products = [...new Set(unique.map((o) => o.product.id))].sort((a, b) => prodRank(a) - prodRank(b));

  const picked: BundleCost[] = [];
  for (const d of products) {
    if (picked.length >= n) break;
    const best = unique.filter((o) => o.product.id === d).sort(cmp)[0];
    if (best) picked.push(best);
  }
  const rest = unique.filter((o) => !picked.includes(o)).sort((a, b) => cmp(a, b) || prodRank(a.product.id) - prodRank(b.product.id));
  for (const o of rest) {
    if (picked.length >= n) break;
    picked.push(o);
  }

  return picked.map((o) => {
    const r = rank(o);
    return { ...o, reason: r === 99 ? '這件商品的其他可用優惠' : `優惠專員推薦第 ${r + 1} 名的優惠` };
  });
}
