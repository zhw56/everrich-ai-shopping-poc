import { isListed, loadProducts, type Channel, type Product } from '../data.js';
import { round1 } from './purchases.js';

/** 依通路取價：免稅店用免稅價，宅配網用宅配價（null 代表宅配網沒有販售） */
export const priceIn = (p: Product, channel: Channel): number | null => (channel === 'home' ? p.home_price : p.price);

export function summarizeProduct(p: Product, channel: Channel = 'dutyfree') {
  return {
    id: p.id,
    name: p.name,
    brand: p.brand,
    category: p.category,
    channel,
    price: priceIn(p, channel),
    dutyfree_price: p.price,
    home_price: p.home_price,
    price_kind: p.price_kind,
    channels: p.channels,
    size_label: p.size_label,
    alcohol_ml: p.alcohol_ml,
    tags: p.tags,
    source_url: p.source_url,
    mock: p.mock,
    verified: p.verified,
  };
}

export type ProductRecInput = {
  budget?: number;
  brand?: string;
  categories?: string[];
  tags?: string[];
  channel?: Channel;
  exclude_ids?: string[];
  prefer_brand?: string;
  top_n?: number;
};

const matchTag = (p: Product, t: string) => p.tags.includes(t) || p.name.includes(t) || p.category === t || p.brand.toLowerCase() === t.toLowerCase();

export function recommendProducts(input: ProductRecInput) {
  const all = loadProducts();
  const channel = input.channel ?? 'dutyfree';
  const brand = input.brand?.toLowerCase();
  const tags = input.tags ?? [];
  const cats = input.categories ?? [];
  const exclude = input.exclude_ids ?? [];
  const brandOk = (p: Product) => !brand || p.brand.toLowerCase() === brand;
  const catOk = (p: Product) => !cats.length || cats.includes(p.category);
  const pool = all.filter((p) => {
    const price = priceIn(p, channel);
    return isListed(p) && price !== null && (!input.budget || price <= input.budget) && brandOk(p) && catOk(p) && !exclude.includes(p.id);
  });

  const items = pool.map((p) => {
    const price = priceIn(p, channel)!;
    const matched = tags.filter((t) => matchTag(p, t));
    const tagScore = tags.length ? (matched.length / tags.length) * 100 : 50;
    const budgetScore = input.budget ? (price / input.budget) * 100 : 50;
    const sameBrand = !!input.prefer_brand && p.brand.toLowerCase() === input.prefer_brand.toLowerCase();
    const score = round1(tagScore * 0.5 + budgetScore * 0.3 + (sameBrand ? 100 : 0) * 0.2);
    const reasons: string[] = [];
    if (matched.length) reasons.push(`符合偏好：${matched.join('、')}`);
    if (input.budget) reasons.push(`${channel === 'home' ? '宅配價' : '免稅價'} ${price.toLocaleString('en-US')} 元，在預算 ${input.budget.toLocaleString('en-US')} 元內`);
    if (sameBrand) reasons.push(`與常買的品牌相同（${p.brand}）`);
    if (p.alcohol_ml) reasons.push(`容量 ${p.alcohol_ml}ml，入境每人酒類免稅 1.5 公升`);
    return { product: summarizeProduct(p, channel), score, matched_tags: matched, reasons };
  });
  // 多個分類時，每個分類先各取最高分一件，再依分數補齊
  items.sort((a, b) => b.score - a.score || b.product.price! - a.product.price!);
  const n = input.top_n ?? 3;
  let picked = items;
  if (cats.length > 1) {
    const first = cats.map((c) => items.find((x) => x.product.category === c)).filter((x): x is (typeof items)[number] => !!x);
    picked = [...first, ...items.filter((x) => !first.includes(x))];
  }

  const target = input.budget ?? 0;
  const nearest = items.length
    ? []
    : all
        .filter((p) => brandOk(p) && catOk(p) && priceIn(p, channel) !== null)
        .sort((a, b) => Math.abs(priceIn(a, channel)! - target) - Math.abs(priceIn(b, channel)! - target))
        .slice(0, 2)
        .map((p) => summarizeProduct(p, channel));

  return { channel, items: picked.slice(0, n), nearest_when_empty: nearest };
}
