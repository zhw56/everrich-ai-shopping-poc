import { useRef } from 'react';
import type { Card, CardSet, Source } from './types';
import { Icon } from './Icon';

const money = (value?: number) => (typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('zh-TW') : '—');
const TITLE = { promo: '優惠活動', product: '商品', bundle: '商品＋優惠組合', order: '訂單明細' } as const;

function priceOf(type: CardSet['type'], c: Card): { value?: number; unit: string } | null {
  if (type === 'promo') return typeof c.saving === 'number' && c.saving > 0 ? { value: c.saving, unit: '可折' } : typeof c.rebate === 'number' && c.rebate > 0 ? { value: c.rebate, unit: '預估回饋' } : null;
  if (type === 'order') return { value: c.total, unit: '實付' };
  if (type === 'bundle') return { value: c.bundle_price, unit: '優惠價' };
  return { value: c.price, unit: c.channel_label === '宅配網' ? '宅配價' : '免稅價' };
}

function OneCard({ type, card, index, onSource }: { type: CardSet['type']; card: Card; index: number; onSource: (s: Source) => void }) {
  const name = type === 'bundle' ? card.product?.name ?? '商品' : type === 'order' ? `預購單 ${card.order_no ?? ''}` : card.name ?? '—';
  const price = priceOf(type, card);
  const eyebrow = type === 'promo' ? card.channel_label ?? '優惠' : type === 'product' ? [card.brand, card.category].filter(Boolean).join('・') || '商品' : type === 'bundle' ? card.promo?.name ?? '搭配優惠' : card.status ?? '訂單';
  return <article className="fx-card">
    <div className="fx-card-eyebrow"><span>{eyebrow}</span><em>{String(index + 1).padStart(2, '0')}</em></div>
    <h4>{name}</h4>
    {price && <p className="fx-price"><small>NT$</small>{money(price.value)}{price.unit && <span>{price.unit}</span>}</p>}
    {type === 'promo' && !price && card.points ? <p className="fx-price"><small>送</small>{money(card.points)}<span>RICH POINT</span></p> : null}
    {type === 'bundle' && typeof card.saving === 'number' && card.saving > 0 && <p className="fx-diff save">原價 {money(card.list_price)} 元，省 {money(card.saving)} 元</p>}
    {type === 'promo' && typeof card.gap === 'number' && card.gap > 0 && <p className="fx-diff more">還差 {money(card.gap)} 元達門檻</p>}
    {type === 'promo' && <dl className="fx-facts"><div><dt>內容</dt><dd>{card.label ?? '—'}</dd></div><div><dt>條件</dt><dd>{card.requirement_label ?? card.condition_label ?? '—'}</dd></div>{card.valid_to && <div><dt>截止</dt><dd>{card.valid_to}</dd></div>}</dl>}
    {type === 'product' && card.size_label && <dl className="fx-facts"><div><dt>規格</dt><dd>{card.size_label}</dd></div></dl>}
    {type === 'bundle' && <dl className="fx-facts"><div><dt>通路</dt><dd>{card.channel_label ?? '—'}</dd></div><div><dt>優惠</dt><dd>{card.promo?.label ?? '—'}</dd></div>{card.gift && <div><dt>加贈</dt><dd>{card.gift}</dd></div>}</dl>}
    {type === 'order' && card.pickup_label && <p className="fx-reason">{card.pickup_label}</p>}
    {type === 'order' && !!card.items?.length && <dl className="fx-facts">{card.items.map((item, i) => <div key={item.name + i}><dt>{item.name}</dt><dd>{money(item.amount)} 元</dd></div>)}</dl>}
    {type === 'order' && card.promo_check?.filter((p) => !p.reached).map((p) => <p className="fx-diff more" key={p.name}>{p.name}：適用 {money(p.eligible_amount)} 元，還差 {money(p.gap)} 元</p>)}
    {!!card.tags?.length && <div className="fx-tags">{card.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
    {card.reason && <p className="fx-reason">{card.reason}</p>}
    <div className="fx-card-foot">
      <span className={`fx-flag${card.verified ? ' ok' : ''}`}>{card.verified ? '已人工核對' : card.mock ? '展示資料' : '待人工核對'}</span>
      {card.source_url && <button onClick={() => onSource({ title: name, url: card.source_url! })}>來源<Icon name="link" size={13} /></button>}
    </div>
  </article>;
}

export function Cards({ set, onSource, layout = 'rail' }: { set: CardSet; onSource: (source: Source) => void; layout?: 'rail' | 'stack' }) {
  const rail = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => rail.current?.scrollBy({ left: dir * 280, behavior: 'smooth' });
  return <section className={`fx-cards ${layout}`} aria-label={TITLE[set.type]}>
    <div className="fx-cards-head"><h3>{TITLE[set.type]}<small>{set.items.length} 筆</small></h3>{layout === 'rail' && set.items.length > 1 && <div className="fx-rail-nav"><button aria-label="上一張" onClick={() => scroll(-1)}>‹</button><button aria-label="下一張" onClick={() => scroll(1)}>›</button></div>}</div>
    <div className="fx-cards-list" ref={rail} tabIndex={layout === 'rail' ? 0 : undefined}>{set.items.map((card, i) => <OneCard key={card.id ?? card.bundle_id ?? card.order_no ?? i} type={set.type} card={card} index={i} onSource={onSource} />)}</div>
  </section>;
}
