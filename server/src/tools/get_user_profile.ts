import { asOfDate, CHANNEL_LABEL, loadProducts } from '../data.js';
import { addDays, daysBetween, PREORDER_DAYS } from '../engine/index.js';
import type { Tool } from '../types.js';
import { maskName, maskPhone } from '../util/mask.js';
import { MOCK_NOTICE, requireVerifiedUser } from './_common.js';

export const getUserProfile: Tool<Record<string, never>> = {
  definition: {
    name: 'get_user_profile',
    description: '取得已驗證會員的 RICHCLUB 等級、點數與到期日、下一趟出國航班（出發日、機場航廈、預購開放日）與常買商品。需要先完成身分驗證。',
    input_schema: { type: 'object', properties: {} },
  },
  async run(_input, ctx) {
    const auth = requireVerifiedUser(ctx);
    if ('error' in auth) return auth.error;
    const u = auth.user;
    const asOf = asOfDate();
    const fav = loadProducts().find((p) => p.id === u.favorite_product_id);
    const trip = u.next_trip;
    return {
      ok: true,
      data: {
        as_of: asOf,
        name: maskName(u.name),
        phone: maskPhone(u.phone),
        member_tier: u.member_tier,
        joined_date: u.joined_date,
        birthday_month: u.birthday_month,
        points: u.points,
        points_expire_date: u.points_expire_date,
        points_expiring: u.points_expiring,
        days_to_points_expire: daysBetween(asOf, u.points_expire_date),
        preferred_channel: u.preferred_channel,
        preferred_channel_label: CHANNEL_LABEL[u.preferred_channel],
        favorite_product: fav ? { id: fav.id, name: fav.name, brand: fav.brand, category: fav.category } : null,
        next_trip: trip
          ? {
              ...trip,
              days_to_trip: daysBetween(asOf, trip.date),
              preorder_opens: addDays(trip.date, -PREORDER_DAYS),
              preorder_open_now: asOf >= addDays(trip.date, -PREORDER_DAYS),
              points_expire_before_trip: u.points_expiring > 0 && u.points_expire_date < trip.date,
            }
          : null,
        mock: true,
        notice: MOCK_NOTICE,
      },
    };
  },
};
