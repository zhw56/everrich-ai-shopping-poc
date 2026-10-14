import { useEffect, useRef, useState } from 'react';
import type { Card, Source } from './types';
import { safeUrl } from './types';
import './compare.css';

type Row = Card & {
  type: 'promo' | 'product' | 'bundle'; price_kind?: string; dutyfree_price?: number; home_price?: number | null;
  channel?: string; min_spend?: number; categories?: string[]; exclude_categories?: string[]; member_tiers?: string[];
};
type Comparison = {
  id: string; title: string; created_at: string; rows: Row[]; sources: Source[]; notice: string;
  share_url: string | null; qr_code: string | null; share_notice: string;
};
const number = (n?: number | null) => typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('zh-TW') : '待確認';
const money = (n?: number | null) => typeof n === 'number' ? `NT$ ${number(n)}` : '待確認';
const name = (row: Row) => row.type === 'bundle' ? row.product?.name ?? '商品組合' : row.name ?? '比較項目';
const labels = { promo: '優惠活動', product: '商品', bundle: '商品＋優惠' };
const fields: { label: string; types: Row['type'][]; value: (row: Row) => string }[] = [
  { label: '搭配優惠', types: ['bundle'], value: r => r.promo?.name ?? '—' },
  { label: '優惠內容', types: ['promo', 'bundle'], value: r => r.label ?? r.promo?.label ?? '待確認' },
  { label: '適用條件', types: ['promo'], value: r => r.condition_label ?? '待確認' },
  { label: '使用身分', types: ['promo'], value: r => [r.requirement_label, r.member_tiers?.length ? `限 ${r.member_tiers.join('、')}` : ''].filter(Boolean).join('，') || '待確認' },
  { label: '門檻金額', types: ['promo'], value: r => r.min_spend ? money(r.min_spend) : '無門檻' },
  { label: '通路', types: ['promo', 'bundle'], value: r => r.channel_label ?? r.promo?.channel_label ?? '待確認' },
  { label: '品牌', types: ['product'], value: r => r.brand ?? '待確認' },
  { label: '分類與規格', types: ['product'], value: r => [r.category, r.size_label].filter(Boolean).join('・') || '待確認' },
  { label: '免稅價', types: ['product'], value: r => money(r.dutyfree_price ?? r.price) },
  { label: '宅配價', types: ['product'], value: r => r.home_price == null ? '宅配網未販售' : money(r.home_price) },
  { label: '價格說明', types: ['product'], value: r => r.price_kind === 'mock' ? '展示假價格' : '以原始來源標示為準' },
  { label: '商品特色', types: ['product'], value: r => r.tags?.join('、') || '待確認' },
  { label: '原價', types: ['bundle'], value: r => money(r.list_price) },
  { label: '優惠價（結帳）', types: ['bundle'], value: r => money(r.bundle_price) },
  { label: '省下金額', types: ['bundle'], value: r => money(r.saving) },
  { label: '加贈', types: ['bundle'], value: r => r.gift || '—' },
  { label: '有效期限', types: ['promo', 'bundle'], value: r => r.valid_to || '未提供，請向門市確認' },
];

export function ComparePage({ id }: { id: string }) {
  const [data, setData] = useState<Comparison | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [copyStatus, setCopyStatus] = useState('');
  const linkInput = useRef<HTMLInputElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setData(null);
    async function load() {
      try {
        const response = await fetch(`/api/compare/${encodeURIComponent(id)}`, { signal: controller.signal });
        if (response.status === 404) throw new Error('找不到這份比較表。連結可能有誤，或展示服務已重新啟動，請回到對話重新產生。');
        if (!response.ok) throw new Error('比較表暫時無法載入，請稍後重試。');
        const result = await response.json();
        if (!result.ok || !Array.isArray(result.data?.rows) || !Array.isArray(result.data?.sources)) throw new Error('比較表資料不完整，請重新產生。');
        if (!controller.signal.aborted) setData(result.data);
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '無法連線，請稍後重試。');
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [id, attempt]);
  useEffect(() => {
    const previous = document.title;
    if (data) document.title = `${data.title}｜昇恆昌購物比較`;
    return () => { document.title = previous; };
  }, [data]);
  async function copy() {
    if (!data?.share_url) return;
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(data.share_url);
      setCopyStatus('已複製分享連結。');
    } catch {
      linkInput.current?.focus(); linkInput.current?.select();
      setCopyStatus('連結已選取，請長按或使用複製快捷鍵。');
    }
  }
  return <main className="compare-page">
    <header className="compare-header"><a href="/">昇恆昌 購物小幫手</a><a className="compare-back" href="/">返回對話</a></header>
    {loading ? <p className="compare-state" role="status">正在準備比較表…</p> : error || !data ? <section className="compare-state" role="alert"><h1>比較表無法開啟</h1><p>{error}</p><button onClick={() => setAttempt(n => n + 1)}>重新載入</button><a href="/">回到對話</a></section> : <>
      <div className="compare-heading"><div><p className="compare-eyebrow">帶著比較去機場，提貨不猶豫</p><h1>{data.title}</h1><p>建立時間：{new Date(data.created_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })}（台灣時間）</p></div><button className="compare-print" onClick={() => window.print()}>列印／存成 PDF</button></div>
      <p className="compare-notice">{data.notice || '此為展示資料，實際價格與活動以昇恆昌公告為準。'}</p>
      <div className="compare-table-heading"><h2>{data.rows.length} 個選擇，一起比較</h2><div className="compare-navigation"><span>左右滑動看完整內容</span><button aria-label="向左查看比較項目" onClick={() => rail.current?.scrollBy({ left: -200, behavior: 'smooth' })}>←</button><button aria-label="向右查看比較項目" onClick={() => rail.current?.scrollBy({ left: 200, behavior: 'smooth' })}>→</button></div></div>
      <div className="compare-table-scroll" ref={rail} tabIndex={0} role="region" aria-label="比較表，可左右捲動">
        <table className="compare-table"><caption className="sr-only">{data.title}，金額單位為新臺幣</caption><thead><tr><th scope="col">比較項目</th>{data.rows.map((row, i) => <th scope="col" key={i}><span className="compare-kind">{labels[row.type]}</span><strong>{name(row)}</strong><span className="compare-flag">{row.mock ? '含展示假資料' : row.verified ? '已人工核對' : '待人工核對'}</span></th>)}</tr></thead><tbody>
          {fields.filter(field => data.rows.some(row => field.types.includes(row.type))).map(field => <tr key={field.label}><th scope="row">{field.label}</th>{data.rows.map((row, i) => <td key={i}>{field.types.includes(row.type) ? field.value(row) : '—'}</td>)}</tr>)}
          <tr><th scope="row">資料來源</th>{data.rows.map((row, i) => <td key={i}>{data.sources.map((source, n) => source.url === row.source_url || source.url === row.promo?.source_url ? <a className="compare-source-ref" href={`#source-${n + 1}`} key={n}>來源 [{n + 1}]</a> : null)}</td>)}</tr>
        </tbody></table>
      </div>
      <p className="compare-cost-note">金額單位為新臺幣。優惠價與省下金額由系統依優惠規則計算；不含點數折抵、其他活動疊加或刷卡回饋。缺少資料以「待確認」標示。</p>
      <section className="compare-sources"><h2>來源與註腳</h2><ol>{data.sources.map((source, i) => <li key={`${source.url}-${i}`} id={`source-${i + 1}`}><strong>[{i + 1}] {source.title}</strong>{source.cited_text && <blockquote>{source.cited_text}</blockquote>}{safeUrl(source.url) ? <a href={safeUrl(source.url)} target="_blank" rel="noreferrer">{source.url}</a> : <span>來源網址無法安全開啟。</span>}</li>)}</ol><p>來源頁僅供追溯，不代表已核對展示假價格或活動假設。此表保留建立時的資料，後續異動請重新查詢。</p></section>
      <section className="compare-share"><div><h2>把這份比較帶到手機</h2><p>{data.share_notice}</p>{data.share_url && <div className="compare-copy"><label className="sr-only" htmlFor="share-url">分享網址</label><input id="share-url" ref={linkInput} value={data.share_url} readOnly onFocus={e => e.currentTarget.select()} /><button onClick={() => void copy()}>複製連結</button></div>}<p className="copy-status" role="status">{copyStatus}</p></div>{data.qr_code?.startsWith('data:image/png;base64,') && <figure><img src={data.qr_code} width="192" height="192" alt="掃描開啟此比較表" /><figcaption>連上同一個 Wi-Fi 後掃描</figcaption></figure>}</section>
      <footer className="compare-footer">昇恆昌 AI 購物小幫手 POC・比較表編號：{data.id}</footer>
    </>}
  </main>;
}
