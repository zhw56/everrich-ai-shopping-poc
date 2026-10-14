import { useMemo, useState } from 'react';
import { api, errorText, type KbItem, type SourceOption } from './api';
import { Badge, DeleteButton, Drawer, Errors, Feedback, Field, Panel, Status, Toggle, today, useLoad } from './ui';

type D = { items: KbItem[]; sources: SourceOption[] };

/** 知識庫（data/kb.md）：AI 查條款與 FAQ 時使用；存檔後下一輪對話立即生效 */
export function Knowledge({ canWrite }: { canWrite: boolean }) {
  const { data, setData, error, loading, reload } = useLoad<D>('/kb');
  const [editing, setEditing] = useState<{ id: string | null; form: Partial<KbItem> } | null>(null);
  const [errs, setErrs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [q, setQ] = useState('');
  const items = useMemo(() => (data?.items ?? []).filter((k) => !q.trim() || (k.title + k.body).includes(q.trim())), [data, q]);
  const set = (k: keyof KbItem, v: unknown) => setEditing((e) => (e ? { ...e, form: { ...e.form, [k]: v } } : e));
  const stale = (k: KbItem) => (Date.now() - Date.parse(k.last_checked)) / 86400000 > 30;

  async function save() {
    if (!editing) return;
    setBusy(true);
    const r = editing.id ? await api<D>(`/kb/${encodeURIComponent(editing.id)}`, { method: 'PUT', body: editing.form }) : await api<D>('/kb', { method: 'POST', body: editing.form });
    setBusy(false);
    if (r.ok) { setData(r.data); setEditing(null); setMsg({ ok: true, text: '已儲存，AI 查知識庫時立即使用' }); }
    else setErrs(r.errors.length ? r.errors : [errorText(r)]);
  }
  async function remove(id: string) {
    const r = await api<D>(`/kb/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (r.ok) { setData(r.data); setEditing(null); setMsg({ ok: true, text: '已刪除' }); }
    else setErrs(r.errors.length ? r.errors : [errorText(r)]);
  }
  const f = editing?.form ?? {};
  return <Panel title="知識庫" desc="條款與常見問題。AI 回答辦理規定時先查這裡，查不到或超過 30 天未檢查才搜尋官網。" actions={canWrite && <button className="bo-btn primary" onClick={() => { setErrs([]); setEditing({ id: null, form: { title: '', body: '', source_id: data?.sources.find((s) => s.type === 'faq')?.id ?? '', last_checked: today(), valid_to: null, mock: false } }); }}>新增知識</button>}>
    <Feedback msg={msg} />
    <Status loading={loading && !data} error={error} retry={reload} />
    {data && <>
      <div className="bo-toolbar"><span className="bo-muted">共 {data.items.length} 則</span><label className="bo-search"><span className="sr-only">搜尋</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋標題或內容" /></label></div>
      <div className="bo-kb">{items.map((k) => <button key={k.id} className="bo-kb-item" onClick={() => { setErrs([]); setEditing({ id: k.id, form: { ...k } }); }}>
        <span className="bo-kb-id">{k.id}</span>
        <strong>{k.title}</strong>
        <p>{k.body}</p>
        <span className="bo-kb-meta">{k.mock ? <Badge tone="amber">含展示資料</Badge> : <Badge>待人工核對</Badge>}{stale(k) ? <Badge tone="amber">超過 30 天未檢查</Badge> : <Badge tone="green">檢查於 {k.last_checked}</Badge>}{k.valid_to && <Badge>有效至 {k.valid_to}</Badge>}</span>
      </button>)}</div>
      {!items.length && <p className="bo-state">沒有符合的知識。</p>}
    </>}
    {editing && <Drawer title={editing.id ? '編輯知識' : '新增知識'} sub={editing.id ? <code>{editing.id}</code> : undefined} onClose={() => setEditing(null)}
      footer={<>{editing.id && canWrite && <DeleteButton onConfirm={() => void remove(editing.id!)} />}<span className="bo-spacer" /><button className="bo-btn" onClick={() => setEditing(null)}>取消</button>{canWrite && <button className="bo-btn primary" disabled={busy} onClick={() => void save()}>{busy ? '檢查並儲存中…' : '儲存'}</button>}</>}>
      <Errors list={errs} />
      <fieldset className="bo-form" disabled={!canWrite}>
        <Field label="問題標題" wide><input value={f.title ?? ''} onChange={(e) => set('title', e.target.value)} maxLength={80} placeholder="例如：預購的商品可以在回國時提貨嗎？" /></Field>
        <Field label="內容" wide hint="寫成客服可以直接引用的說明；段落之間空一行"><textarea rows={10} value={f.body ?? ''} onChange={(e) => set('body', e.target.value)} /></Field>
        <Field label="資料來源" wide><select value={f.source_id ?? ''} onChange={(e) => set('source_id', e.target.value)}><option value="">請選擇</option>{data?.sources.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</select></Field>
        <Field label="最後檢查日" hint="超過 30 天會改查官網"><input type="date" value={f.last_checked ?? ''} onChange={(e) => set('last_checked', e.target.value)} /></Field>
        <Field label="有效期限" hint="活動類內容請填，留空代表長期有效"><input type="date" value={f.valid_to ?? ''} onChange={(e) => set('valid_to', e.target.value || null)} /></Field>
        <Field label="含展示資料"><Toggle checked={!!f.mock} onChange={(v) => set('mock', v)} label="含展示資料" /></Field>
      </fieldset>
      <p className="bo-hint">「預購」「提貨」「1.5 公升」（入境酒類額度）是展示情境用到的核心主題，刪光會被資料檢查擋下。</p>
    </Drawer>}
  </Panel>;
}
