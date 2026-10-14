import { isListed, loadProducts, loadPromos, type User } from '../data.js';
import { isExpired } from './dates.js';

/**
 * 訂單說明：小計、折扣、實付，以及「滿額折為什麼沒有折」的門檻檢查（排除分類不列入計算）。
 * 金額全部由這裡計算，模型只負責解釋。
 */
export function explainOrder(user: User, orderNo?: string, asOf?: string) {
  const orders = [...user.orders].sort((a, b) => a.created_date.localeCompare(b.created_date));
  const idx = orderNo ? orders.findIndex((o) => o.order_no === orderNo) : orders.length - 1;
  if (idx < 0) return null;
  const order = orders[idx];
  const previous = idx > 0 ? orders[idx - 1] : null;
  const products = loadProducts();
  const goods = order.items.filter((i) => i.amount > 0 && i.product_id);
  const subtotal = order.items.filter((i) => i.amount > 0).reduce((s, i) => s + i.amount, 0);
  const discounts = order.items.filter((i) => i.amount < 0);
  const discountTotal = discounts.reduce((s, i) => s + i.amount, 0);
  const categoryOf = (pid?: string) => products.find((p) => p.id === pid)?.category ?? '其他';

  const date = asOf ?? order.created_date;
  const promoCheck = loadPromos()
    .filter((p) => isListed(p) && p.promo_type === 'threshold' && !p.member_tiers.length && (p.channel === 'all' || p.channel === order.channel))
    .filter((p) => !isExpired(p.valid_to, date) && (!p.valid_from || p.valid_from <= date))
    .map((p) => {
      const counted = goods.filter((g) => (!p.categories.length || p.categories.includes(categoryOf(g.product_id))) && !p.exclude_categories.includes(categoryOf(g.product_id)));
      const notCounted = goods.filter((g) => !counted.includes(g));
      const eligible = counted.reduce((s, g) => s + g.amount, 0);
      return {
        promo_id: p.id,
        promo_name: p.name,
        label: p.label,
        min_spend: p.min_spend,
        eligible_amount: eligible,
        reached: eligible >= p.min_spend,
        gap: Math.max(0, p.min_spend - eligible),
        not_counted: notCounted.map((g) => ({ name: g.name, category: categoryOf(g.product_id), amount: g.amount })),
        applied: discounts.some((d) => d.name.includes(p.name)),
        source_url: p.source_url,
      };
    })
    // 訂單裡沒有任何商品適用的活動不列出，避免干擾
    .filter((c) => c.eligible_amount > 0);

  return {
    order,
    previous: previous ? { order_no: previous.order_no, created_date: previous.created_date, total: previous.total, channel: previous.channel } : null,
    subtotal,
    discount_total: discountTotal,
    total: order.total,
    discount_items: discounts,
    promo_check: promoCheck,
    order_count: orders.length,
    mock: true,
  };
}
