import { useMemo, useState, type ReactNode } from 'react';
import { api, errorText, type BundleRow, type CatalogData, type ProductRow, type PromoRow } from './api';
import { DeleteButton, Drawer, Errors, Feedback, Field, Panel, Status, Toggle, nt, trust, useLoad } from './ui';

type Kind = 'promos' | 'products' | 'bundles';
type AnyRow = PromoRow | ProductRow | BundleRow;
const META: Record<Kind, { title: string; desc: string; noun: string }> = {
  promos: { title: '優惠活動', desc: '活動的折扣、門檻、適用分類與會員等級。下架或過期後不會出現在查詢與推薦；每筆可折多少由推薦引擎依規則計算。', noun: '優惠' },
  products: { title: '商品', desc: '免稅價、宅配價、分類與標籤，推薦引擎依此挑選。宅配價留空代表宅配網不販售（例如酒類）。', noun: '商品' },
  bundles: { title: '組合優惠價', desc: '單一商品套用單一優惠後的結帳價；省下金額由程式計算（原價－優惠價）。', noun: '組合' },
};
const CATS = ['美妝保養', '香水', '酒類', '精品配件', '食品伴手禮'];
const TIERS = ['初心者', '探索者', '創造者', '領航者'];
const CHANNEL: Record<string, string> = { dutyfree: '免稅店', home: '宅配網', all: '兩者皆可' };
const TYPE: Record<string, string> = { rate: '折扣', threshold: '滿額折', points: '送點數', rebate: '點數回饋' };
const REQ: Record<string, string> = { none: '不限身分', member: 'RICHCLUB 會員', card: '聯名卡結帳', app: 'App 任務' };

function blank(kind: Kind, src: string): Record<string, any> {
  if (kind === 'promos') return { name: '', channel: 'dutyfree', promo_type: 'rate', discount_rate: '', max_discount: '', min_spend: 0, discount_amount: '', points: '', categories: [], exclude_categories: [], member_tiers: [], requirement: 'member', label: '', condition_label: '', valid_from: '', valid_to: '', source_id: src, note: '', listed: true };
  if (kind === 'products') return { name: '', brand: '', category: '美妝保養', price: '', home_price: '', size_label: '', alcohol_ml: '', tags: '', source_id: src, note: '', listed: true };
  return { product_id: '', promo_id: '', channel: 'dutyfree', bundle_price: '', gift: '', valid_from: '', valid_to: '', note: '', listed: true };
}
const blankIfNull = (v: unknown) => (v === null || v === undefined ? '' : v);
const toForm = (kind: Kind, r: AnyRow): Record<string, any> => ({
  ...r,
  ...(kind === 'products' ? { tags: (r as ProductRow).tags.join('、'), home_price: blankIfNull((r as ProductRow).home_price), alcohol_ml: blankIfNull((r as ProductRow).alcohol_ml) } : {}),
  ...(kind === 'promos' ? { discount_rate: blankIfNull((r as PromoRow).discount_rate), max_discount: blankIfNull((r as PromoRow).max_discount), discount_amount: blankIfNull((r as PromoRow).discount_amount), points: blankIfNull((r as PromoRow).points) } : {}),
  valid_from: (r as any).valid_from ?? '', valid_to: (r as any).valid_to ?? '', gift: (r as any).gift ?? '',
});
function toBody(kind: Kind, f: Record<string, any>) {
  const num = (v: unknown) => (v === '' || v === null ? NaN : Number(v));
  const opt = (v: unknown) => (v === '' || v === null || v === undefined ? null : Number(v));
  const b: Record<string, any> = { ...f };
  delete b.refs; delete b.id; delete b.mock; delete b.verified; delete b.mock_fields; delete b.source_url; delete b.channels;
  if (kind === 'promos') Object.assign(b, { discount_rate: opt(f.discount_rate), max_discount: opt(f.max_discount), min_spend: num(f.min_spend), discount_amount: opt(f.discount_amount), points: opt(f.points) });
  if (kind === 'products') Object.assign(b, { price: num(f.price), home_price: opt(f.home_price), alcohol_ml: opt(f.alcohol_ml), tags: String(f.tags).split(/[、,，\s]+/).filter(Boolean) });
  if (kind === 'bundles') Object.assign(b, { bundle_price: num(f.bundle_price) });
  return b;
}
const promoText = (r: PromoRow) =>
  r.promo_type === 'rate' ? `${Math.round((1 - (r.discount_rate ?? 0)) * 100) / 10} 折` : r.promo_type === 'threshold' ? `滿 ${nt(r.min_spend)} 折 ${nt(r.discount_amount ?? 0)}` : r.promo_type === 'points' ? `送 ${nt(r.points ?? 0)} 點` : `回饋 ${Math.round((r.discount_rate ?? 0) * 100)}%`;

function Checks({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  return <span className="bo-checks">{options.map((x) => <label key={x} className="bo-check"><input type="checkbox" checked={value?.includes(x)} onChange={(e) => onChange(e.target.checked ? [...(value ?? []), x] : (value ?? []).filter((v) => v !== x))} />{x}</label>)}</span>;
}

export function Catalog({ kind, canWrite }: { kind: Kind; canWrite: boolean }) {
  const { data, setData, error, loading, reload } = useLoad<CatalogData<AnyRow>>(`/catalog/${kind}`);
  const promos = useLoad<CatalogData<PromoRow>>(kind === 'bundles' ? '/catalog/promos' : null);
  const products = useLoad<CatalogData<ProductRow>>(kind === 'bundles' ? '/catalog/products' : null);
  const [editing, setEditing] = useState<{ id: string | null; form: Record<string, any> } | null>(null);
  const [errs, setErrs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [q, setQ] = useState('');
  const [show, setShow] = useState<'all' | 'listed' | 'unlisted'>('all');
  const meta = META[kind];
  const sourceTypes = kind === 'products' ? ['product'] : ['promo', 'faq'];
  const sources = (data?.sources ?? []).filter((s) => sourceTypes.includes(s.type));
  const promoName = (id: string) => promos.data?.rows.find((p) => p.id === id)?.name ?? id;
  const productName = (id: string) => products.data?.rows.find((d) => d.id === id)?.name ?? id;
  const productOf = (id: string) => products.data?.rows.find((d) => d.id === id);

  const rows = useMemo(() => (data?.rows ?? []).filter((r) => {
    if (show === 'listed' && !r.listed) return false;
    if (show === 'unlisted' && r.listed) return false;
    const text = kind === 'bundles' ? `${productName((r as BundleRow).product_id)} ${promoName((r as BundleRow).promo_id)}` : `${(r as any).name} ${(r as any).brand ?? ''}`;
    return !q.trim() || (text + r.id).toLowerCase().includes(q.trim().toLowerCase());
  }), [data, q, show, promos.data, products.data]);

  async function save() {
    if (!editing) return;
    setBusy(true);
    const body = toBody(kind, editing.form);
    const r = editing.id ? await api<CatalogData<AnyRow>>(`/catalog/${kind}/${encodeURIComponent(editing.id)}`, { method: 'PUT', body }) : await api<CatalogData<AnyRow>>(`/catalog/${kind}`, { method: 'POST', body });
    setBusy(false);
    if (r.ok) { setData(r.data); setEditing(null); setErrs([]); setMsg({ ok: true, text: editing.id ? '已儲存，下一輪對話立即使用' : `已新增${meta.noun}` }); }
    else setErrs(r.errors.length ? r.errors : [errorText(r)]);
  }
  async function listed(r: AnyRow, v: boolean) {
    const res = await api<CatalogData<AnyRow>>(`/catalog/${kind}/${encodeURIComponent(r.id)}/listed`, { method: 'POST', body: { listed: v } });
    if (res.ok) setData(res.data);
    setMsg(res.ok ? { ok: true, text: v ? '已上架' : '已下架' } : { ok: false, text: errorText(res) });
  }
  async function remove(id: string) {
    const res = await api<CatalogData<AnyRow>>(`/catalog/${kind}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (res.ok) { setData(res.data); setEditing(null); setMsg({ ok: true, text: '已刪除' }); }
    else setErrs(res.errors.length ? res.errors : [errorText(res)]);
  }
  const set = (k: string, v: unknown) => setEditing((e) => (e ? { ...e, form: { ...e.form, [k]: v } } : e));

  const cols: { h: string; cell: (r: any) => ReactNode; cls?: string }[] =
    kind === 'promos' ? [
      { h: '活動', cell: (r: PromoRow) => <><strong>{r.name}</strong><small>{r.id}</small></> },
      { h: '通路', cell: (r: PromoRow) => CHANNEL[r.channel] },
      { h: '優惠', cell: (r: PromoRow) => promoText(r) },
      { h: '條件', cell: (r: PromoRow) => [REQ[r.requirement], r.member_tiers.length ? r.member_tiers.join('、') : ''].filter(Boolean).join('・') },
      { h: '截止', cell: (r: PromoRow) => r.valid_to ?? '未公告' },
    ] : kind === 'products' ? [
      { h: '商品', cell: (r: ProductRow) => <><strong>{r.name}</strong><small>{r.id}</small></> },
      { h: '分類', cell: (r: ProductRow) => r.category },
      { h: '免稅價', cell: (r: ProductRow) => `${nt(r.price)} 元`, cls: 'num' },
      { h: '宅配價', cell: (r: ProductRow) => (r.home_price === null ? '不販售' : `${nt(r.home_price)} 元`), cls: 'num' },
      { h: '標籤', cell: (r: ProductRow) => <span className="bo-tags">{r.tags.slice(0, 3).map((t) => <i key={t}>{t}</i>)}</span> },
    ] : [
      { h: '商品', cell: (r: BundleRow) => <><strong>{productName(r.product_id)}</strong><small>{r.id}</small></> },
      { h: '優惠', cell: (r: BundleRow) => promoName(r.promo_id) },
      { h: '通路', cell: (r: BundleRow) => CHANNEL[r.channel] },
      { h: '優惠價', cell: (r: BundleRow) => `${nt(r.bundle_price)} 元`, cls: 'num' },
    ];

  const f = editing?.form ?? {};
  const bp = kind === 'bundles' ? productOf(f.product_id) : undefined;
  return <Panel title={meta.title} desc={meta.desc} actions={canWrite && <button className="bo-btn primary" onClick={() => { setErrs([]); setEditing({ id: null, form: blank(kind, sources[0]?.id ?? '') }); }}>新增{meta.noun}</button>}>
    <Feedback msg={msg} />
    <Status loading={loading && !data} error={error} retry={reload} />
    {data && <>
      <div className="bo-toolbar">
        <div className="bo-seg" role="tablist" aria-label="上架狀態">{([['all', '全部'], ['listed', '上架中'], ['unlisted', '已下架']] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={show === k} className={show === k ? 'on' : ''} onClick={() => setShow(k)}>{l}<small>{data.rows.filter((r) => (k === 'all' ? true : k === 'listed' ? r.listed : !r.listed)).length}</small></button>)}</div>
        <label className="bo-search"><span className="sr-only">搜尋</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`搜尋${meta.noun}名稱或代號`} /></label>
      </div>
      <div className="bo-table-wrap"><table className="bo-table">
        <thead><tr>{cols.map((c) => <th key={c.h} className={c.cls}>{c.h}</th>)}<th>資料</th><th>上架</th><th aria-label="操作" /></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id} className={r.listed ? '' : 'off'}>
          {cols.map((c) => <td key={c.h} className={c.cls}>{c.cell(r)}</td>)}
          <td>{trust(r)}</td>
          <td><Toggle checked={r.listed} disabled={!canWrite} label={`${r.listed ? '下架' : '上架'} ${r.id}`} onChange={(v) => void listed(r, v)} /></td>
          <td className="act"><button className="bo-btn ghost" onClick={() => { setErrs([]); setEditing({ id: r.id, form: toForm(kind, r) }); }}>{canWrite ? '編輯' : '檢視'}</button></td>
        </tr>)}</tbody>
      </table>{!rows.length && <p className="bo-state">沒有符合條件的{meta.noun}。</p>}</div>
    </>}

    {editing && <Drawer title={editing.id ? `編輯${meta.noun}` : `新增${meta.noun}`} sub={editing.id ? <code>{editing.id}</code> : '新增的資料一律標示為展示資料'} onClose={() => setEditing(null)}
      footer={<>{editing.id && canWrite && <DeleteButton onConfirm={() => void remove(editing.id!)} disabled={!!(f.refs?.users || f.refs?.bundles)} title={f.refs?.users || f.refs?.bundles ? '仍被引用，請改為下架' : undefined} />}<span className="bo-spacer" /><button className="bo-btn" onClick={() => setEditing(null)}>取消</button>{canWrite && <button className="bo-btn primary" disabled={busy} onClick={() => void save()}>{busy ? '檢查並儲存中…' : '儲存'}</button>}</>}>
      <Errors list={errs} />
      {editing.id && <div className="bo-note">{f.refs?.users || f.refs?.bundles ? <>被 {f.refs.users} 位展示會員（常買或訂單）、{f.refs.bundles} 組優惠價引用，不能刪除，可改為下架。</> : '沒有其他資料引用，可以刪除。'}{kind !== 'bundles' && ' 修改折扣、門檻、價格等數字後，這筆會自動標成展示資料。'}</div>}
      <fieldset className="bo-form" disabled={!canWrite}>
        {kind === 'promos' && <>
          <Field label="活動名稱" wide><input value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={40} /></Field>
          <Field label="通路"><select value={f.channel} onChange={(e) => set('channel', e.target.value)}>{Object.entries(CHANNEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label="優惠類型"><select value={f.promo_type} onChange={(e) => set('promo_type', e.target.value)}>{Object.entries(TYPE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          {['rate', 'rebate'].includes(f.promo_type) && <Field label={f.promo_type === 'rate' ? '折扣比例' : '回饋比例'} hint="0.1 代表 9 折或回饋 10%"><input type="number" step="0.01" min={0} max={1} value={f.discount_rate} onChange={(e) => set('discount_rate', e.target.value)} /></Field>}
          {['rate', 'rebate'].includes(f.promo_type) && <Field label="上限（元）" hint="空白代表無上限"><input type="number" min={0} value={f.max_discount} onChange={(e) => set('max_discount', e.target.value)} /></Field>}
          <Field label="門檻金額（元）" hint="0 代表無門檻"><input type="number" min={0} value={f.min_spend} onChange={(e) => set('min_spend', e.target.value)} /></Field>
          {f.promo_type === 'threshold' && <Field label="折抵金額（元）"><input type="number" min={0} value={f.discount_amount} onChange={(e) => set('discount_amount', e.target.value)} /></Field>}
          {f.promo_type === 'points' && <Field label="點數"><input type="number" min={0} value={f.points} onChange={(e) => set('points', e.target.value)} /></Field>}
          <Field label="適用分類" hint="都不勾代表全館" wide><Checks options={CATS} value={f.categories} onChange={(v) => set('categories', v)} /></Field>
          <Field label="排除分類" hint="不列入計算的分類，例如酒類" wide><Checks options={CATS} value={f.exclude_categories} onChange={(v) => set('exclude_categories', v)} /></Field>
          <Field label="限定會員等級" hint="都不勾代表不限" wide><Checks options={TIERS} value={f.member_tiers} onChange={(v) => set('member_tiers', v)} /></Field>
          <Field label="使用條件"><select value={f.requirement} onChange={(e) => set('requirement', e.target.value)}>{Object.entries(REQ).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label="優惠內容" hint="卡片上顯示的一句話" wide><input value={f.label} onChange={(e) => set('label', e.target.value)} /></Field>
          <Field label="適用條件說明" wide><input value={f.condition_label} onChange={(e) => set('condition_label', e.target.value)} /></Field>
          <Field label="開始日"><input type="date" value={f.valid_from} onChange={(e) => set('valid_from', e.target.value)} /></Field>
          <Field label="截止日" hint="出發日晚於截止日時不會被推薦"><input type="date" value={f.valid_to} onChange={(e) => set('valid_to', e.target.value)} /></Field>
        </>}
        {kind === 'products' && <>
          <Field label="商品名稱" wide><input value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={60} /></Field>
          <Field label="品牌"><input value={f.brand} onChange={(e) => set('brand', e.target.value)} /></Field>
          <Field label="分類"><select value={f.category} onChange={(e) => set('category', e.target.value)}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="免稅價（元）"><input type="number" min={0} value={f.price} onChange={(e) => set('price', e.target.value)} /></Field>
          <Field label="宅配價（元）" hint="留空代表宅配網不販售"><input type="number" min={0} value={f.home_price} onChange={(e) => set('home_price', e.target.value)} /></Field>
          <Field label="規格"><input value={f.size_label} onChange={(e) => set('size_label', e.target.value)} placeholder="例如 100ml" /></Field>
          {f.category === '酒類' && <Field label="酒類容量（ml）" hint="用來提醒入境免稅額度"><input type="number" min={0} value={f.alcohol_ml} onChange={(e) => set('alcohol_ml', e.target.value)} /></Field>}
          <Field label="標籤" hint="以頓號或逗號分隔，例如：送禮、保濕、送長輩" wide><input value={f.tags} onChange={(e) => set('tags', e.target.value)} /></Field>
        </>}
        {kind === 'bundles' && <>
          <Field label="商品" wide><select value={f.product_id} onChange={(e) => set('product_id', e.target.value)}><option value="">請選擇</option>{products.data?.rows.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
          <Field label="優惠" wide hint="來源依優惠自動帶入"><select value={f.promo_id} onChange={(e) => set('promo_id', e.target.value)}><option value="">請選擇</option>{promos.data?.rows.map((p) => <option key={p.id} value={p.id}>{p.name}（{CHANNEL[p.channel]}）</option>)}</select></Field>
          <Field label="通路" hint={bp ? `原價：免稅 ${nt(bp.price)} 元${bp.home_price === null ? '，宅配網不販售' : `、宅配 ${nt(bp.home_price)} 元`}` : undefined}><select value={f.channel} onChange={(e) => set('channel', e.target.value)}><option value="dutyfree">免稅店</option><option value="home">宅配網</option></select></Field>
          <Field label="優惠價（元）"><input type="number" min={0} value={f.bundle_price} onChange={(e) => set('bundle_price', e.target.value)} /></Field>
          <Field label="加贈"><input value={f.gift} onChange={(e) => set('gift', e.target.value)} placeholder="可留空" /></Field>
          <Field label="開始日"><input type="date" value={f.valid_from} onChange={(e) => set('valid_from', e.target.value)} /></Field>
          <Field label="截止日"><input type="date" value={f.valid_to} onChange={(e) => set('valid_to', e.target.value)} /></Field>
        </>}
        {kind !== 'bundles' && <Field label="資料來源" wide hint="來源頁只供追溯，不代表已核對展示價格"><select value={f.source_id} onChange={(e) => set('source_id', e.target.value)}><option value="">請選擇</option>{sources.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</select></Field>}
        <Field label="說明" wide><textarea rows={3} value={f.note} onChange={(e) => set('note', e.target.value)} /></Field>
        <Field label="上架"><Toggle checked={!!f.listed} onChange={(v) => set('listed', v)} label="上架" /></Field>
      </fieldset>
      {editing.id && f.mock_fields?.length > 0 && <p className="bo-hint">展示資料欄位：{f.mock_fields.join('、')}</p>}
      {editing.id && <p className="bo-hint">{trust(f as any)} {f.source_url && <a href={f.source_url} target="_blank" rel="noreferrer">開啟來源頁 ↗</a>}</p>}
    </Drawer>}
  </Panel>;
}

export const PromosPage = (p: { canWrite: boolean }) => <Catalog kind="promos" {...p} />;
export const ProductsPage = (p: { canWrite: boolean }) => <Catalog kind="products" {...p} />;
export const BundlesPage = (p: { canWrite: boolean }) => <Catalog kind="bundles" {...p} />;
