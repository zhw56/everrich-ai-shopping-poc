import type { BundleCost } from '../engine/bundles.js';

export type Combo = BundleCost & { reason: string };

/**
 * 從商品專員的優惠價報價與優惠專員的推薦排名，挑出最多 n 組「商品＋優惠」。
 * 只做挑選與排序，價格與省下金額一律沿用 get_promo_price（引擎）的計算結果。
 *
 * 規則（2026-10-15 修正：原本照「整體優惠排名」挑，會出現同一件商品「要聯名卡卻比較不省」還排在前面）：
 * 1. 同一件商品先排除「被比下去」的選項：另一個選項省得一樣多或更多、門檻又沒有更高（不限身分＜會員＜App 任務＜聯名卡），
 *    這個選項就沒有理由推薦（例如要聯名卡 9 折省 430，不如不限身分的品牌週省 516）。
 * 2. 每件推薦商品先出一組「這件最省的優惠」，依商品推薦順序排列。
 * 3. 不足 n 組時，補「門檻比較低」的替代選項（例如沒有聯名卡時改用會員 95 折），省得多的優先。
 */
export type RankedPromo = { id: string };

const REQ_LEVEL: Record<string, number> = { none: 0, member: 1, app: 2, card: 3 };
const level = (o: BundleCost) => REQ_LEVEL[o.promo.requirement] ?? 3;
const REQ_SHORT: Record<string, string> = { member: '會員身分', app: 'App 任務', card: '聯名卡' };

/** a 是否把 b 比下去：同一件商品，a 省得不比 b 少、門檻不比 b 高，且至少一項更好 */
function dominates(a: BundleCost, b: BundleCost): boolean {
  if (a.product.id !== b.product.id || a.bundle_id === b.bundle_id) return false;
  return a.saving >= b.saving && level(a) <= level(b) && (a.saving > b.saving || level(a) < level(b));
}

export function pickCombos(options: BundleCost[], productOrder: string[], promoOrder: RankedPromo[], n = 3): Combo[] {
  const unique = [...new Map(options.map((o) => [o.bundle_id, o])).values()];
  const kept = unique.filter((o) => !unique.some((x) => dominates(x, o)));
  const promoRank = (o: BundleCost) => {
    const i = promoOrder.findIndex((p) => p.id === o.promo.id);
    return i >= 0 ? i : 99;
  };
  // 省最多優先；一樣多時門檻低的優先，再看優惠專員的推薦名次
  const better = (a: BundleCost, b: BundleCost) => b.saving - a.saving || level(a) - level(b) || promoRank(a) - promoRank(b);
  const prodRank = (id: string) => {
    const i = productOrder.indexOf(id);
    return i < 0 ? 99 : i;
  };
  const products = [...new Set(kept.map((o) => o.product.id))].sort((a, b) => prodRank(a) - prodRank(b));

  const picked: Combo[] = [];
  const bestOf = new Map<string, BundleCost>();
  for (const id of products) {
    if (picked.length >= n) break;
    const best = kept.filter((o) => o.product.id === id).sort(better)[0];
    if (!best) continue;
    bestOf.set(id, best);
    picked.push({ ...best, reason: '這件商品最省的優惠' });
  }
  const rest = kept.filter((o) => !picked.some((p) => p.bundle_id === o.bundle_id)).sort(better);
  for (const o of rest) {
    if (picked.length >= n) break;
    const best = bestOf.get(o.product.id);
    const reason = best && level(o) < level(best) ? `沒有${REQ_SHORT[best.promo.requirement] ?? best.promo.requirement_label}時的選擇` : '這件商品的其他可用優惠';
    picked.push({ ...o, reason });
  }
  return picked;
}
