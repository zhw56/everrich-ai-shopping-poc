import { useEffect, useState } from 'react';
import { api, errorText, type FrontendConfig, type Shortcut } from './api';
import { Errors, Feedback, Field, Panel, Status, useLoad } from './ui';

const ICONS: { v: Shortcut['icon']; label: string }[] = [
  { v: 'promo', label: '優惠' },
  { v: 'product', label: '商品' },
  { v: 'order', label: '訂單' },
  { v: 'help', label: '規定與服務' },
];

/** 前台文案與入口（data/frontend.json）；右側即時預覽手機首頁 */
export function FrontendSettings({ canWrite }: { canWrite: boolean }) {
  const { data, setData, error, loading, reload } = useLoad<FrontendConfig>('/frontend');
  const [f, setF] = useState<FrontendConfig | null>(null);
  const [errs, setErrs] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setF(data); }, [data]);
  const dirty = !!f && JSON.stringify(f) !== JSON.stringify(data);
  const set = <K extends keyof FrontendConfig>(k: K, v: FrontendConfig[K]) => setF((x) => (x ? { ...x, [k]: v } : x));
  const setShortcut = (i: number, k: keyof Shortcut, v: string) => setF((x) => (x ? { ...x, shortcuts: x.shortcuts.map((s, n) => (n === i ? { ...s, [k]: v } : s)) } : x));

  async function save() {
    if (!f) return;
    setBusy(true);
    const r = await api<FrontendConfig>('/frontend', { method: 'PUT', body: f });
    setBusy(false);
    if (r.ok) { setData(r.data); setErrs([]); setMsg({ ok: true, text: '已儲存，重新整理前台即可看到' }); }
    else { setErrs(r.errors.length ? r.errors : [errorText(r)]); setMsg(null); }
  }

  return <Panel title="前台設定" desc="首頁歡迎詞、快捷入口、建議問題與提示文字。儲存後前台重新整理就會套用。" actions={canWrite && <div className="bo-inline compact"><button className="bo-btn" disabled={!dirty} onClick={() => setF(data)}>還原</button><button className="bo-btn primary" disabled={!dirty || busy} onClick={() => void save()}>{busy ? '儲存中…' : '儲存'}</button></div>}>
    <Feedback msg={msg} />
    <Errors list={errs} />
    <Status loading={loading && !data} error={error} retry={reload} />
    {f && <div className="bo-split">
      <fieldset className="bo-stack" disabled={!canWrite}>
        <div className="bo-card"><h3>首頁</h3><div className="bo-form">
          <Field label="服務名稱" hint="顯示在頁首「昇恆昌」後面"><input value={f.service_name} maxLength={30} onChange={(e) => set('service_name', e.target.value)} /></Field>
          <Field label="歡迎標題"><input value={f.welcome_title} maxLength={40} onChange={(e) => set('welcome_title', e.target.value)} /></Field>
          <Field label="歡迎說明" wide><textarea rows={2} value={f.welcome_subtitle} maxLength={120} onChange={(e) => set('welcome_subtitle', e.target.value)} /></Field>
        </div></div>
        <div className="bo-card"><div className="bo-card-head"><h3>快捷入口（{f.shortcuts.length}／6）</h3>{f.shortcuts.length < 6 && <button className="bo-btn ghost" onClick={() => set('shortcuts', [...f.shortcuts, { icon: 'help', title: '', subtitle: '', prompt: '' }])}>＋ 新增入口</button>}</div>
          <div className="bo-repeat">{f.shortcuts.map((s, i) => <div key={i} className="bo-repeat-row">
            <div className="bo-form">
              <Field label="圖示"><select value={s.icon} onChange={(e) => setShortcut(i, 'icon', e.target.value)}>{ICONS.map((x) => <option key={x.v} value={x.v}>{x.label}</option>)}</select></Field>
              <Field label="標題"><input value={s.title} maxLength={12} onChange={(e) => setShortcut(i, 'title', e.target.value)} /></Field>
              <Field label="說明" wide><input value={s.subtitle} maxLength={24} onChange={(e) => setShortcut(i, 'subtitle', e.target.value)} /></Field>
              <Field label="點選後送出的問題" wide><input value={s.prompt} maxLength={200} onChange={(e) => setShortcut(i, 'prompt', e.target.value)} /></Field>
            </div>
            <div className="bo-repeat-tools">
              <button className="bo-icon-btn" aria-label="上移" disabled={i === 0} onClick={() => { const a = [...f.shortcuts]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; set('shortcuts', a); }}>↑</button>
              <button className="bo-icon-btn" aria-label="下移" disabled={i === f.shortcuts.length - 1} onClick={() => { const a = [...f.shortcuts]; [a[i + 1], a[i]] = [a[i], a[i + 1]]; set('shortcuts', a); }}>↓</button>
              <button className="bo-icon-btn" aria-label="刪除" disabled={f.shortcuts.length <= 1} onClick={() => set('shortcuts', f.shortcuts.filter((_, n) => n !== i))}>×</button>
            </div>
          </div>)}</div>
        </div>
        <div className="bo-card"><div className="bo-card-head"><h3>建議問題（{f.suggestions.length}／6）</h3>{f.suggestions.length < 6 && <button className="bo-btn ghost" onClick={() => set('suggestions', [...f.suggestions, ''])}>＋ 新增</button>}</div>
          <div className="bo-repeat">{f.suggestions.map((q, i) => <div key={i} className="bo-repeat-row single"><input value={q} maxLength={200} aria-label={`建議問題 ${i + 1}`} onChange={(e) => set('suggestions', f.suggestions.map((x, n) => (n === i ? e.target.value : x)))} /><button className="bo-icon-btn" aria-label="刪除" onClick={() => set('suggestions', f.suggestions.filter((_, n) => n !== i))}>×</button></div>)}</div>
        </div>
        <div className="bo-card"><h3>其他文字</h3><div className="bo-form">
          <Field label="輸入框提示"><input value={f.composer_placeholder} maxLength={40} onChange={(e) => set('composer_placeholder', e.target.value)} /></Field>
          <Field label="結果區空白標題"><input value={f.results_empty_title} maxLength={40} onChange={(e) => set('results_empty_title', e.target.value)} /></Field>
          <Field label="結果區空白說明" wide><input value={f.results_empty_text} maxLength={120} onChange={(e) => set('results_empty_text', e.target.value)} /></Field>
          <Field label="輸入框下方說明" wide><input value={f.footer_note} maxLength={120} onChange={(e) => set('footer_note', e.target.value)} /></Field>
          <Field label="驗證視窗提示" wide><textarea rows={2} value={f.demo_hint} maxLength={200} onChange={(e) => set('demo_hint', e.target.value)} /></Field>
        </div></div>
      </fieldset>
      <aside className="bo-preview" aria-label="手機預覽">
        <div className="bo-phone">
          <div className="bo-phone-top"><i />昇恆昌 <b>{f.service_name}</b></div>
          <div className="bo-phone-body">
            <h4>{f.welcome_title}</h4>
            <p>{f.welcome_subtitle}</p>
            <div className="bo-phone-grid">{f.shortcuts.map((s, i) => <div key={i}><b>{s.title || '標題'}</b><small>{s.subtitle || '說明'}</small></div>)}</div>
            {f.suggestions.filter(Boolean).length > 0 && <div className="bo-phone-sugg"><small>也可以這樣問</small>{f.suggestions.filter(Boolean).map((q, i) => <span key={i}>{q}</span>)}</div>}
          </div>
          <div className="bo-phone-input">{f.composer_placeholder}</div>
        </div>
        <p className="bo-hint">預覽為示意，實際樣式以前台為準。</p>
      </aside>
    </div>}
  </Panel>;
}
