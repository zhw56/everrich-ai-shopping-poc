import { useState } from 'react';
import { api, errorText, type Source, type SourceRow } from './api';
import { Badge, Feedback, Panel, Status, resultMsg, useLoad } from './ui';

type D = { sources: SourceRow[]; allowed_domains: string[] };
const TYPE_LABEL = { promo: '優惠活動', product: '商品', faq: '規定與服務' } as const;
const empty: Source = { id: '', type: 'faq', title: '', url: 'https://www.everrich-group.com/', enabled: true, last_checked: new Date().toISOString().slice(0, 10), note: '' };

function SourceForm({ initial, isNew, disabled, onSave, onCancel }: { initial: Source; isNew: boolean; disabled: boolean; onSave: (s: Source) => Promise<void>; onCancel: () => void }) {
  const [s, setS] = useState(initial);
  const set = (k: keyof Source, v: unknown) => setS((x) => ({ ...x, [k]: v }));
  const [busy, setBusy] = useState(false);
  return <form className="bo-form" onSubmit={async (e) => { e.preventDefault(); setBusy(true); await onSave(s); setBusy(false); }}>
    <label>ID<input value={s.id} onChange={(e) => set('id', e.target.value)} disabled={!isNew} placeholder="src-faq-example" required /><small>{isNew ? '小寫英數與連字號；建立後不可更改（其他資料以此關聯）' : 'ID 不可更改'}</small></label>
    <label>分類<select value={s.type} onChange={(e) => set('type', e.target.value)}>{Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}（{k}）</option>)}</select></label>
    <label className="wide">標題<input value={s.title} onChange={(e) => set('title', e.target.value)} maxLength={120} required /></label>
    <label className="wide">網址<input value={s.url} onChange={(e) => set('url', e.target.value)} inputMode="url" required /><small>只接受 HTTPS 的 everrich-group.com、customs.gov.tw（搜尋）或 taishinbank.com.tw（只供追溯）與其子網域；搜尋只會用到這個頁面路徑</small></label>
    <label>最後檢查日<input type="date" value={s.last_checked ?? ''} onChange={(e) => set('last_checked', e.target.value || null)} /></label>
    <label className="bo-check"><input type="checkbox" checked={s.enabled} onChange={(e) => set('enabled', e.target.checked)} />啟用（納入搜尋範圍）</label>
    <label className="wide">備註<textarea value={s.note} onChange={(e) => set('note', e.target.value)} rows={3} maxLength={1000} /></label>
    <div className="bo-form-actions wide"><button type="button" className="bo-btn" onClick={onCancel}>取消</button><button className="bo-btn primary" disabled={disabled || busy}>{busy ? '儲存中…' : '儲存'}</button></div>
  </form>;
}

export function Sources({ canWrite }: { canWrite: boolean }) {
  const { data, setData, error, loading, reload } = useLoad<D>('/sources');
  const [editing, setEditing] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [query, setQuery] = useState('昇恆昌週年慶活動到什麼時候？');
  const [test, setTest] = useState<{ busy: boolean; text: string; sources: { title: string; url: string }[] } | null>(null);

  async function run(p: Promise<import('./api').ApiResult<D>>, ok: string) {
    const r = await p;
    setMsg(resultMsg(r, ok));
    if (r.ok) { setData(r.data); setEditing(null); setConfirmDel(null); }
  }
  async function runTest() {
    setTest({ busy: true, text: '', sources: [] });
    const r = await api<{ result_ok: boolean; error: string | null; sources: { title: string; url: string }[]; answer: string | null }>('/sources/test', { method: 'POST', body: { query } });
    if (!r.ok) return setTest({ busy: false, text: errorText(r), sources: [] });
    const d = r.data;
    setTest({ busy: false, text: d.result_ok ? d.answer ?? '搜尋成功' : d.error === 'NO_ENABLED_SOURCES' ? '沒有啟用的來源，搜尋不會送出（NO_ENABLED_SOURCES）' : d.error === 'NO_ALLOWED_SOURCES' ? '搜尋結果都不在允許清單內，已全部排除（NO_ALLOWED_SOURCES）' : `搜尋失敗：${d.error}`, sources: d.sources });
  }

  return <Panel title="搜尋來源管理" desc="維護 data/sources.json。只有「啟用」的來源會成為官網搜尋的允許範圍，修改後下一次 search_official_web 立即生效。檢查來源不會自動把商品標為已核對。" actions={canWrite && <button className="bo-btn primary" onClick={() => { setEditing('__new'); setMsg(null); }}>新增來源</button>}>
    <Feedback msg={msg} />
    <Status loading={loading} error={error} retry={reload} />
    {editing === '__new' && <div className="bo-card"><h3>新增來源</h3><SourceForm initial={empty} isNew disabled={!canWrite} onCancel={() => setEditing(null)} onSave={(s) => run(api<D>('/sources', { method: 'POST', body: s }), `已新增 ${s.id}`)} /></div>}
    {data && <>
      <div className="bo-card bo-allowed"><h3>目前的搜尋允許範圍（{data.allowed_domains.length} 個路徑）</h3>{data.allowed_domains.length ? <ul>{data.allowed_domains.map((d) => <li key={d}><code>{d}</code></li>)}</ul> : <p className="bo-warn">沒有任何啟用來源：官網搜尋會直接回 NO_ENABLED_SOURCES，不會退回不受限搜尋。</p>}</div>
      <div className="bo-list">{data.sources.map((s) => <article key={s.id} className={`bo-row ${s.enabled ? '' : 'off'}`}>
        {editing === s.id ? <SourceForm initial={s} isNew={false} disabled={!canWrite} onCancel={() => setEditing(null)} onSave={(v) => run(api<D>(`/sources/${encodeURIComponent(s.id)}`, { method: 'PUT', body: v }), `已更新 ${s.id}`)} /> : <>
          <div className="bo-row-main"><h3>{s.title}</h3><a className="bo-url" href={s.url} target="_blank" rel="noreferrer">{s.url}</a>{s.note && <p>{s.note}</p>}</div>
          <div className="bo-row-foot">{s.enabled ? <Badge tone="green">啟用</Badge> : <Badge>停用</Badge>}<Badge tone="blue">{TYPE_LABEL[s.type]}</Badge><Badge>最後檢查 {s.last_checked ?? '未檢查'}</Badge><Badge tone={s.refs.total ? 'amber' : 'gray'}>被引用 {s.refs.total} 筆</Badge><code>{s.id}</code></div>
          {canWrite && <div className="bo-row-actions">
            <button className="bo-btn" onClick={() => run(api<D>(`/sources/${encodeURIComponent(s.id)}`, { method: 'PUT', body: { enabled: !s.enabled } }), `${s.id} 已${s.enabled ? '停用' : '啟用'}`)}>{s.enabled ? '停用' : '啟用'}</button>
            <button className="bo-btn" onClick={() => run(api<D>(`/sources/${encodeURIComponent(s.id)}`, { method: 'PUT', body: { last_checked: new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' }) } }), `${s.id} 已更新檢查日`)}>標記今天已檢查</button>
            <button className="bo-btn" onClick={() => { setEditing(s.id); setMsg(null); }}>編輯</button>
            {s.refs.total > 0 ? <button className="bo-btn" disabled title="有資料引用，請改為停用">刪除（被引用）</button> : confirmDel === s.id ? <button className="bo-btn danger" onClick={() => run(api<D>(`/sources/${encodeURIComponent(s.id)}`, { method: 'DELETE' }), `已刪除 ${s.id}`)}>確認刪除</button> : <button className="bo-btn" onClick={() => setConfirmDel(s.id)}>刪除</button>}
          </div>}
        </>}
      </article>)}</div>
      <div className="bo-card"><h3>測試搜尋</h3><p className="bo-hint">用目前啟用的來源實際搜尋昇恆昌官網一次（會使用 API 額度）。</p><div className="bo-inline"><input value={query} onChange={(e) => setQuery(e.target.value)} aria-label="測試問題" /><button className="bo-btn primary" disabled={!canWrite || test?.busy || !query.trim()} onClick={() => void runTest()}>{test?.busy ? '搜尋中…' : '測試'}</button></div>{test && !test.busy && <div className="bo-test"><p>{test.text}</p>{test.sources.length > 0 && <ul>{test.sources.map((s, i) => <li key={i}>{s.title}<br /><code>{s.url}</code></li>)}</ul>}</div>}</div>
    </>}
  </Panel>;
}
