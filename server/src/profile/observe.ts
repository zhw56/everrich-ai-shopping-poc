import { loadProducts, loadUsers } from '../data.js';
import type { ToolResult } from '../types.js';
import { marketingConsentOf } from './consent.js';
import { applyPatches, type AttrPatch } from './merge.js';
import type { Profile } from './schema.js';

/** 驗證完成後同步會員身分與行銷同意（驗證走 /api/verify，不經過主控的工具迴圈） */
export function syncSession(p: Profile, session: { verified: boolean; user_id: string | null }) {
  if (session.verified && session.user_id && p.user_id !== session.user_id) {
    p.user_id = session.user_id;
    p.marketing_consent = marketingConsentOf(session.user_id);
    const patches: AttrPatch[] = [{ key: 'is_member', value: true, source: 'system' }];
    // 驗證後直接帶入會員資料（等級、下一趟出發日、點數到期、常買商品），不必等主控剛好呼叫 get_user_profile，
    // 否則同一位會員在不同對話的分眾會不一致（例如 S6 只查訂單時就沒有「高等級會員」「近期出國」）
    try {
      const u: any = loadUsers().users.find((x: any) => x.id === session.user_id);
      if (u?.member_tier) patches.push({ key: 'member_tier', value: u.member_tier, source: 'system' });
      if (u?.next_trip?.date) patches.push({ key: 'next_trip', value: u.next_trip.date, source: 'system' });
      if (u?.points_expiring > 0 && u?.points_expire_date) patches.push({ key: 'points_expire', value: u.points_expire_date, source: 'system' });
      const fav = u?.favorite_product_id ? loadProducts().find((x) => x.id === u.favorite_product_id) : null;
      if (fav) patches.push({ key: 'favorite_product', value: fav.name, source: 'system' });
    } catch {
      /* 會員檔讀不到時只標記為會員 */
    }
    applyPatches(p, patches, '');
  }
}

/** 從工具結果寫入會員資料（來源：會員資料），不經過模型推測 */
export function observeTool(p: Profile, tool: string, result: ToolResult, session: { verified: boolean; user_id: string | null }) {
  syncSession(p, session);
  if (!result.ok) return;
  const d = result.data as any;
  const patches: AttrPatch[] = [];
  if (tool === 'get_user_profile') {
    if (d?.member_tier) patches.push({ key: 'member_tier', value: d.member_tier, source: 'system' });
    if (d?.favorite_product?.name) patches.push({ key: 'favorite_product', value: d.favorite_product.name, source: 'system' });
    if (d?.next_trip?.date) patches.push({ key: 'next_trip', value: d.next_trip.date, source: 'system' });
    if (d?.points_expiring > 0 && d?.points_expire_date) patches.push({ key: 'points_expire', value: d.points_expire_date, source: 'system' });
  }
  if (tool === 'recommend_promos' && d?.basket_basis) {
    const b = d.basket_basis;
    if (b.source === 'purchase_history' && typeof b.avg_per_trip === 'number') patches.push({ key: 'avg_spend', value: b.avg_per_trip, source: 'system' });
    if (b.source === 'manual' && typeof b.amount === 'number') patches.push({ key: 'budget_total', value: b.amount, source: 'inferred', confidence: 0.8 });
    if (b.source === 'manual' && Array.isArray(b.categories) && b.categories.length) patches.push({ key: 'category_interest', value: b.categories, source: 'inferred', confidence: 0.7 });
  }
  if (tool === 'get_purchases' && typeof d?.summary?.avg_per_trip === 'number') patches.push({ key: 'avg_spend', value: d.summary.avg_per_trip, source: 'system' });
  if (patches.length) applyPatches(p, patches, '');
}
