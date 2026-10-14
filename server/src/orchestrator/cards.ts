import type { ToolResult } from '../types.js';

export type CardSet = { type: 'promo' | 'product' | 'bundle' | 'order'; items: unknown[] };

const promoCard = (p: any, extra: Record<string, unknown> = {}) => ({
  id: p.id,
  name: p.name,
  label: p.label,
  condition_label: p.condition_label,
  channel_label: p.channel_label,
  requirement_label: p.requirement_label,
  valid_to: p.valid_to,
  source_url: p.source_url,
  mock: p.mock,
  verified: p.verified,
  ...extra,
});

const productCard = (d: any, extra: Record<string, unknown> = {}) => ({
  id: d.id,
  name: d.name,
  brand: d.brand,
  category: d.category,
  channel: d.channel,
  price: d.price,
  size_label: d.size_label,
  tags: d.tags,
  source_url: d.source_url,
  mock: d.mock,
  verified: d.verified,
  ...extra,
});

/** 把工具結果轉成約定的卡片格式；每輪只送出最後一組卡片 */
export function cardsFrom(tool: string, result: ToolResult): CardSet | null {
  const d = result.data as any;
  if (!d) return null;
  switch (tool) {
    case 'recommend_promos': {
      if (!d.items?.length) return null;
      return {
        type: 'promo',
        items: d.items.map((x: any) =>
          promoCard(x.promo, { saving: x.effect.discount, rebate: x.effect.rebate, points: x.effect.points, gap: x.effect.gap_to_threshold, pay_amount: x.effect.pay_amount, reason: x.reasons.join('；') }),
        ),
      };
    }
    case 'query_promos':
      return d.promos?.length ? { type: 'promo', items: d.promos.slice(0, 6).map((p: any) => promoCard(p)) } : null;
    case 'recommend_products': {
      const list = d.items?.length ? d.items.map((x: any) => productCard(x.product, { reason: x.reasons.join('；') })) : (d.nearest_when_empty ?? []).map((x: any) => productCard(x, { reason: '最接近條件的商品' }));
      return list.length ? { type: 'product', items: list } : null;
    }
    case 'query_products':
      return d.products?.length ? { type: 'product', items: d.products.slice(0, 6).map((x: any) => productCard(x)) } : null;
    case 'get_promo_price':
      return d.options?.length
        ? {
            type: 'bundle',
            items: d.options.map((o: any) => ({
              bundle_id: o.bundle_id,
              product: o.product,
              promo: promoCard(o.promo),
              channel_label: o.channel_label,
              list_price: o.list_price,
              bundle_price: o.bundle_price,
              saving: o.saving,
              total_cost: o.total_cost,
              gift: o.gift,
              source_url: o.source_url,
              mock: o.mock,
              verified: o.verified,
            })),
          }
        : null;
    case 'get_order':
      return d.order
        ? {
            type: 'order',
            items: [
              {
                order_no: d.order.order_no,
                channel: d.order.channel,
                status: d.order.status,
                pickup_label: d.order.pickup_label,
                total: d.total,
                subtotal: d.subtotal,
                discount_total: d.discount_total,
                items: d.order.items.map((i: any) => ({ name: i.name, amount: i.amount })),
                promo_check: d.promo_check.map((p: any) => ({ name: p.promo_name, reached: p.reached, gap: p.gap, eligible_amount: p.eligible_amount })),
                mock: true,
              },
            ],
          }
        : null;
    default:
      return null;
  }
}
