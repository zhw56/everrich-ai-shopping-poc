import type { PurchaseRow } from '../data.js';

export const round1 = (n: number) => Math.round(n * 10) / 10;

export type PurchaseSummary = {
  months: number;
  total_spend: number;
  dutyfree_spend: number;
  home_spend: number;
  trips: number;
  /** 每趟出國在免稅店的平均消費 */
  avg_per_trip: number;
  avg_monthly: number;
  top_categories: { category: string; amount: number; share: number }[];
};

/** 近幾個月消費摘要：金額加總與平均都在這裡算，模型不做算術 */
export function summarizePurchases(rows: PurchaseRow[], months = 6): PurchaseSummary {
  const r = rows.slice(-months);
  const dutyfree = r.reduce((s, x) => s + x.dutyfree_amount, 0);
  const home = r.reduce((s, x) => s + x.home_amount, 0);
  const trips = r.reduce((s, x) => s + x.trips, 0);
  const cats = new Map<string, number>();
  for (const x of r) for (const [c, v] of Object.entries(x.categories ?? {})) cats.set(c, (cats.get(c) ?? 0) + v);
  const total = dutyfree + home;
  return {
    months: r.length,
    total_spend: total,
    dutyfree_spend: dutyfree,
    home_spend: home,
    trips,
    avg_per_trip: trips ? Math.round(dutyfree / trips) : 0,
    avg_monthly: r.length ? Math.round(total / r.length) : 0,
    top_categories: [...cats]
      .sort((a, b) => b[1] - a[1])
      .map(([category, amount]) => ({ category, amount, share: total ? round1((amount / total) * 100) : 0 })),
  };
}
