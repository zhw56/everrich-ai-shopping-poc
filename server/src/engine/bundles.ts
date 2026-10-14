import { CHANNEL_LABEL, isListed, loadBundles, loadProducts, loadPromos, type Bundle } from '../data.js';
import { isExpired } from './dates.js';
import { priceIn } from './products.js';
import { summarizePromo } from './promos.js';

/** 組合優惠價：商品原價（依通路）與套用優惠後的結帳價，省下金額由這裡計算 */
export function costOfBundle(b: Bundle) {
  const promo = loadPromos().find((p) => p.id === b.promo_id);
  const product = loadProducts().find((d) => d.id === b.product_id);
  if (!promo || !product) return null;
  const listPrice = priceIn(product, b.channel);
  if (listPrice === null) return null;
  return {
    bundle_id: b.id,
    product: { id: product.id, name: product.name, brand: product.brand, category: product.category, price: listPrice, price_kind: product.price_kind },
    promo: summarizePromo(promo),
    channel: b.channel,
    channel_label: CHANNEL_LABEL[b.channel],
    list_price: listPrice,
    bundle_price: b.bundle_price,
    saving: listPrice - b.bundle_price,
    /** 結帳金額；與 bundle_price 相同，保留欄位名稱讓比較表與卡片一致 */
    total_cost: b.bundle_price,
    gift: b.gift,
    valid_to: b.valid_to,
    source_id: b.source_id,
    source_url: b.source_url,
    mock: b.mock,
    verified: b.verified,
  };
}

export type BundleCost = NonNullable<ReturnType<typeof costOfBundle>>;

export function bundleOptions(productId: string, asOf: string, promoId?: string, channel?: string): BundleCost[] {
  return loadBundles()
    .filter((b) => isListed(b) && b.product_id === productId && (!promoId || b.promo_id === promoId) && (!channel || b.channel === channel) && !isExpired(b.valid_to, asOf))
    .map(costOfBundle)
    .filter((x): x is BundleCost => x !== null)
    .sort((a, b) => a.bundle_price - b.bundle_price);
}

export function bundleById(id: string): BundleCost | null {
  const b = loadBundles().find((x) => x.id === id);
  return b ? costOfBundle(b) : null;
}
