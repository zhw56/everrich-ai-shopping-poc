import { useEffect, useState } from 'react';
import { api, errorText, type Scenario, type ScenariosData } from './api';
import { Badge, DeleteButton, Drawer, Errors, Feedback, Field, Panel, Status, Toggle, useLoad } from './ui';

export const TOOL_LABEL: Record<string, string> = {
  request_verification: '驗證會員', show_quick_replies: '快速回覆', dispatch_agents: '派工給專員',
  get_user_profile: '讀取會員資料', get_purchases: '讀取消費紀錄', get_order: '讀取訂單', query_promos: '查優惠', recommend_promos: '推薦優惠',
  query_products: '查商品', recommend_products: '推薦商品', get_promo_price: '優惠價', search_kb: '查知識庫', search_official_web: '搜尋官網',
  generate_comparison: '產生比較表', handoff_to_human: '轉真人',
};
const MODE = { single: '主控直接處理', multi: '派工給專員', none: '不呼叫工具' } as const;

/** 由表單內容畫出的流程步驟（唯讀）：觸發 → 驗證 → 追問 → 工具／專員 → 回覆 */
function Flow({ s }: { s: Scenario }) {
  const steps: { kind: string; label: string; detail?: string }[] = [{ kind: 'trigger', label: '用戶提問', detail: s.examples[0] }];
  if (s.need_verify) steps.push({ kind: 'verify', label: '驗證會員' });
  if (s.follow_up) steps.push({ kind: 'ask', label: '追問條件', detail: s.follow_up });
  const tools = s.tools.filter((t) => t !== 'request_verification' && t !== 'show_quick_replies');
  if (s.mode === 'multi') steps.push({ kind: 'agent', label: '平行派工', detail: '商品、優惠、訂單、知識專員' });
  else if (tools.length) steps.push({ kind: 'tool', label: '呼叫工具', detail: tools.map((t) => TOOL_LABEL[t] ?? t).join('・') });
  steps.push({ kind: 'reply', label: s.mode === 'none' ? '禮貌說明' : '整合回答', detail: s.answer_guide });
  return <ol className="bo-flow" aria-label={`${s.name} 流程`}>{steps.map((x, i) => <li key={i} className={x.kind}><b>{x.label}</b>{x.detail && <small>{x.detail}</small>}</li>)}</ol>;
}

export function Scenarios({ canWrite }: { canWrite: boolean }) {
  const { data, setData, error, loading, reload } = useLoad<ScenariosData>('/scenarios');
  const [editing, setEditing] = useState<{ index: number | null; form: Scenario } | null>(null);
  const [errs, setErrs] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  useEffect(() => setErrs([]), [editing?.index]);

  async function saveAll(list: Scenario[], ok: string) {
    setBusy(true);
    const r = await api<ScenariosData>('/scenarios', { method: 'PUT', body: { scenarios: list } });
    setBusy(false);
    if (r.ok) { setData(r.data); setEditing(null); setErrs([]); setMsg({ ok: true, text: ok }); return true; }
    setErrs(r.errors.length ? r.errors : [errorText(r)]);
    return false;
  }
  function submit() {
    if (!data || !editing) return;
    const form = { ...editing.form, examples: editing.form.examples.map((x) => x.trim()).filter(Boolean) };
    const list = editing.index === null ? [...data.scenarios, form] : data.scenarios.map((x, i) => (i === editing.index ? form : x));
    void saveAll(list, '已儲存，下一輪對話生效');
  }
  const set = <K extends keyof Scenario>(k: K, v: Scenario[K]) => setEditing((e) => (e ? { ...e, form: { ...e.form, [k]: v } } : e));
  const f = editing?.form;
  const nextId = () => `S${(data?.scenarios ?? []).reduce((m, s) => Math.max(m, Number(s.id.replace(/\D/g, '')) || 0), 0) + 1}`;

  return <Panel title="情境設定" desc="每個情境的觸發問句、是否需驗證、使用的工具、追問與回答方式。儲存後組進系統提示詞的「情境設定」段落，下一輪對話生效；固定防護規則仍優先。" actions={canWrite && <button className="bo-btn primary" onClick={() => setEditing({ index: null, form: { id: nextId(), name: '', enabled: true, examples: [''], need_verify: false, mode: 'single', tools: [], follow_up: '', answer_guide: '' } })}>新增情境</button>}>
    <Feedback msg={msg} />
    {!editing && <Errors list={errs} />}
    <Status loading={loading && !data} error={error} retry={reload} />
    {data && <>
      <div className="bo-scenarios">{data.scenarios.map((s, i) => <article key={s.id} className={`bo-scenario${s.enabled ? '' : ' off'}`}>
        <header><span className="bo-sid">{s.id}</span><h3>{s.name}</h3><span className="bo-scenario-tags">{s.need_verify && <Badge tone="blue">需驗證</Badge>}<Badge>{MODE[s.mode]}</Badge>{!s.enabled && <Badge tone="amber">已停用</Badge>}</span>
          <span className="bo-scenario-act"><Toggle checked={s.enabled} disabled={!canWrite || busy} label={`${s.enabled ? '停用' : '啟用'} ${s.name}`} onChange={(v) => void saveAll(data.scenarios.map((x, n) => (n === i ? { ...x, enabled: v } : x)), v ? `已啟用 ${s.id}` : `已停用 ${s.id}`)} /><button className="bo-btn ghost" onClick={() => setEditing({ index: i, form: { ...s, examples: s.examples.length ? s.examples : [''] } })}>{canWrite ? '編輯' : '檢視'}</button></span>
        </header>
        <Flow s={s} />
      </article>)}</div>
      <div className="bo-card"><div className="bo-card-head"><h3>組進提示詞的內容</h3><button className="bo-btn ghost" onClick={() => setShowPrompt((x) => !x)} aria-expanded={showPrompt}>{showPrompt ? '收合' : '展開'}</button></div>{showPrompt ? <pre className="bo-pre">{data.prompt}</pre> : <p className="bo-hint">AI 實際讀到的情境說明，由上面的設定自動產生。</p>}</div>
    </>}
    {editing && f && <Drawer title={editing.index === null ? '新增情境' : `編輯 ${f.id}`} onClose={() => setEditing(null)}
      footer={<>{editing.index !== null && canWrite && <DeleteButton onConfirm={() => void saveAll(data!.scenarios.filter((_, i) => i !== editing.index), `已刪除 ${f.id}`)} />}<span className="bo-spacer" /><button className="bo-btn" onClick={() => setEditing(null)}>取消</button>{canWrite && <button className="bo-btn primary" disabled={busy} onClick={submit}>{busy ? '儲存中…' : '儲存'}</button>}</>}>
      <Errors list={errs} />
      <fieldset className="bo-form" disabled={!canWrite}>
        <Field label="代號" hint="英數字，例如 S11"><input value={f.id} disabled={editing.index !== null} onChange={(e) => set('id', e.target.value)} /></Field>
        <Field label="名稱"><input value={f.name} maxLength={30} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="啟用" hint="停用時 AI 會說明目前不提供並建議轉真人"><Toggle checked={f.enabled} onChange={(v) => set('enabled', v)} label="啟用" /></Field>
        <Field label="需要先驗證身分"><Toggle checked={f.need_verify} onChange={(v) => set('need_verify', v)} label="需要先驗證身分" /></Field>
        <Field label="處理方式" wide><select value={f.mode} onChange={(e) => set('mode', e.target.value as Scenario['mode'])}>{Object.entries(MODE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="範例問句" wide hint="一行一則，最多 5 則"><textarea rows={3} value={f.examples.join('\n')} onChange={(e) => set('examples', e.target.value.split('\n').slice(0, 5))} /></Field>
        <Field label="建議工具" wide><span className="bo-checks grid">{data!.tools.map((t) => <label key={t} className="bo-check"><input type="checkbox" checked={f.tools.includes(t)} onChange={(e) => set('tools', e.target.checked ? [...f.tools, t] : f.tools.filter((x) => x !== t))} />{TOOL_LABEL[t] ?? t}</label>)}</span></Field>
        <Field label="追問方式" wide><textarea rows={2} maxLength={300} value={f.follow_up} onChange={(e) => set('follow_up', e.target.value)} placeholder="例如：條件不足時一次只問一題" /></Field>
        <Field label="回答方式" wide><textarea rows={2} maxLength={300} value={f.answer_guide} onChange={(e) => set('answer_guide', e.target.value)} /></Field>
      </fieldset>
      <h4 className="bo-sub">流程預覽</h4>
      <Flow s={{ ...f, examples: f.examples.filter(Boolean) }} />
    </Drawer>}
  </Panel>;
}
