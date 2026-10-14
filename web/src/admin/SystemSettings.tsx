import { useEffect, useState } from 'react';
import { api, errorText, type SettingsData, type Source3 } from './api';
import { Badge, Errors, Feedback, Field, Panel, Status, Toggle, useLoad } from './ui';

type S = SettingsData['settings'];
type NumKey = 'max_tool_calls' | 'max_agents' | 'agent_timeout_seconds' | 'daily_chat_limit' | 'ip_chat_limit';
const NUM_GROUPS: { title: string; desc: string; keys: NumKey[] }[] = [
  { title: 'AI 行為上限', desc: '上限不能超過防護規則（6 次工具、3 個專員）；調低可以節省成本與等待時間。', keys: ['max_tool_calls', 'max_agents', 'agent_timeout_seconds'] },
  { title: '流量限制', desc: '只在雲端公開模式生效，避免 API 費用失控；0 代表不限制。', keys: ['daily_chat_limit', 'ip_chat_limit'] },
];
const UNIT: Record<NumKey, string> = { max_tool_calls: '次', max_agents: '個', agent_timeout_seconds: '秒', daily_chat_limit: '輪', ip_chat_limit: '輪' };
const MODELS = ['claude-sonnet-5', 'claude-haiku-4-5-20251001', 'claude-opus-5-5'];
const FROM: Record<Source3, { tone: 'green' | 'blue' | 'red'; text: string }> = {
  admin: { tone: 'green', text: '使用後台設定' },
  env: { tone: 'blue', text: '使用環境變數' },
  none: { tone: 'red', text: '尚未設定' },
};
const From = ({ from }: { from: Source3 }) => <Badge tone={FROM[from].tone}>{FROM[from].text}</Badge>;

export function SystemSettings({ canWrite }: { canWrite: boolean }) {
  const { data, setData, error, loading, reload } = useLoad<SettingsData>('/settings');
  const [s, setS] = useState<Record<string, string> | null>(null);
  const [secret, setSecret] = useState({ anthropic_api_key: '', inception_api_key: '', github_token: '' });
  const [errs, setErrs] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState<{ busy: boolean; results: { name: string; ok: boolean; message: string }[] } | null>(null);
  useEffect(() => { if (data) setS(Object.fromEntries(Object.entries(data.settings).map(([k, v]) => [k, String(v)]))); }, [data]);
  const dirty = !!data && !!s && Object.entries(data.settings).some(([k, v]) => String(v) !== s[k]);
  const set = (k: keyof S, v: string) => setS((x) => (x ? { ...x, [k]: v } : x));

  async function saveSettings() {
    if (!s || !data) return;
    setBusy(true);
    const body = Object.fromEntries(Object.entries(s).map(([k, v]) => [k, typeof data.settings[k as keyof S] === 'number' ? Number(v) : typeof data.settings[k as keyof S] === 'boolean' ? v === 'true' : v]));
    const r = await api<SettingsData>('/settings', { method: 'PUT', body });
    setBusy(false);
    if (r.ok) { setData(r.data); setErrs([]); setMsg({ ok: true, text: '已儲存，下一輪對話生效' }); }
    else { setErrs(r.errors.length ? r.errors : [errorText(r)]); setMsg(null); }
  }
  async function saveSecret(key: 'anthropic_api_key' | 'inception_api_key' | 'github_token', value: string) {
    setBusy(true);
    const r = await api<SettingsData>('/secrets', { method: 'PUT', body: { [key]: value } });
    setBusy(false);
    if (r.ok) { setData(r.data); setSecret((x) => ({ ...x, [key]: '' })); setErrs([]); setMsg({ ok: true, text: value ? '已加密保存，下一輪對話生效' : '已清除，改用環境變數（若有）' }); }
    else { setErrs(r.errors.length ? r.errors : [errorText(r)]); setMsg(null); }
  }
  async function resetAll() {
    const r = await api<SettingsData>('/secrets/reset', { method: 'POST' });
    if (r.ok) { setData(r.data); setMsg({ ok: true, text: '已清除全部金鑰，請重新輸入' }); } else setErrs(r.errors.length ? r.errors : [errorText(r)]);
  }
  async function runTest() {
    setTest({ busy: true, results: [] });
    const r = await api<{ results: { name: string; ok: boolean; message: string }[] }>('/settings/test', { method: 'POST' });
    setTest({ busy: false, results: r.ok ? r.data.results : [{ name: '測試', ok: false, message: errorText(r) }] });
  }

  // 用一般函式而不是元件，避免每次重繪換掉 input 而失去焦點
  const secretRow = (k: 'anthropic_api_key' | 'inception_api_key' | 'github_token', label: string, hint: string) => {
    const masked = data?.secrets.masked[k];
    return <div className="bo-secret">
      <div className="bo-secret-head"><span className="bo-label">{label}</span><From from={data!.effective[k].from} />{masked && <code>{masked}</code>}</div>
      <div className="bo-inline">
        <input type="password" autoComplete="off" value={secret[k]} onChange={(e) => setSecret((x) => ({ ...x, [k]: e.target.value }))} placeholder={masked ? '輸入新的值以取代' : '貼上金鑰'} aria-label={label} disabled={!canWrite || !data?.secrets.can_store} />
        <button className="bo-btn primary" disabled={!canWrite || busy || !secret[k].trim() || !data?.secrets.can_store} onClick={() => void saveSecret(k, secret[k])}>保存</button>
        {masked && <button className="bo-btn" disabled={!canWrite || busy} onClick={() => void saveSecret(k, '')}>清除</button>}
      </div>
      <small className="bo-hint">{hint}</small>
    </div>;
  };

  return <Panel title="系統參數" desc="模型、金鑰、發布與分享設定，以及 AI 行為上限。後台有填的值優先，留空才使用部署平台的環境變數；儲存後下一輪對話立即生效。" actions={canWrite && <button className="bo-btn primary" disabled={!dirty || busy} onClick={() => void saveSettings()}>{busy ? '儲存中…' : '儲存設定'}</button>}>
    <Feedback msg={msg} />
    <Errors list={errs} />
    <Status loading={loading && !data} error={error} retry={reload} />
    {data && s && <>
      <div className="bo-card"><div className="bo-card-head"><h3>模型供應商</h3><button className="bo-btn" disabled={!canWrite || test?.busy} onClick={() => void runTest()}>{test?.busy ? '測試中…' : '測試目前供應商'}</button></div>
        {test && !test.busy && <ul className="bo-test-results">{test.results.map((r) => <li key={r.name} className={r.ok ? 'ok' : 'bad'}><b>{r.name}</b>{r.message}</li>)}</ul>}
        <p className="bo-hint">正式展示用 Claude；平常測試或給同學試玩可切到 Inception Mercury，費用約為 Claude 的幾十分之一，但中文與工具判斷可能較弱，測試結果不代表 Claude 的表現。官網搜尋固定用 Claude，結果快取 24 小時。</p>
        <div className="bo-seg" role="radiogroup" aria-label="模型供應商">{(['anthropic', 'inception'] as const).map((p) => <button key={p} type="button" role="radio" aria-checked={s.llm_provider === p} className={s.llm_provider === p ? 'on' : ''} disabled={!canWrite} onClick={() => set('llm_provider', p)}>{data.provider.labels[p]}</button>)}</div>
        {data.provider.from === 'env' && <p className="bo-warn">這台伺服器的環境變數 LLM_PROVIDER 指定使用 {data.provider.labels[data.provider.value]}，後台的選擇不會生效。</p>}
        <p className="bo-hint">目前生效：<b>{data.provider.labels[data.provider.value]}</b>・主控 <code>{data.provider.orchestrator ?? '無'}</code>・專員 <code>{data.provider.agent ?? '無'}</code></p>
        <fieldset className="bo-form" disabled={!canWrite}>
          <Field label="Inception 模型" hint={`留空＝${data.provider.inception_default_model}；主控與專員共用`}><input value={s.inception_model} onChange={(e) => set('inception_model', e.target.value)} placeholder={data.provider.inception_default_model} /></Field>
        </fieldset>
        {secretRow('inception_api_key', 'Inception API 金鑰', '到 platform.inceptionlabs.ai 的 API Keys 建立，新帳號有免費額度；同樣以管理密碼加密保存。')}
      </div>

      <div className="bo-card"><h3>Claude 模型與金鑰</h3>
        <fieldset className="bo-form" disabled={!canWrite}>
          <Field label="主控模型" hint={<>目前生效：<code>{data.effective.model_orchestrator.value ?? '無'}</code> <From from={data.effective.model_orchestrator.from} /></>}><input list="bo-models" value={s.model_orchestrator} onChange={(e) => set('model_orchestrator', e.target.value)} placeholder="留空＝用環境變數" /></Field>
          <Field label="專員模型" hint={<>目前生效：<code>{data.effective.model_agent.value ?? '無'}</code> <From from={data.effective.model_agent.from} /></>}><input list="bo-models" value={s.model_agent} onChange={(e) => set('model_agent', e.target.value)} placeholder="留空＝用環境變數" /></Field>
        </fieldset>
        <datalist id="bo-models">{MODELS.map((m) => <option key={m} value={m} />)}</datalist>
        {secretRow('anthropic_api_key', 'Anthropic API 金鑰（Claude）', '以管理密碼（ADMIN_TOKEN）加密後保存，發布時只會把加密檔寫回 GitHub；畫面只顯示前後幾碼。')}
        {!data.secrets.can_store && <p className="bo-warn">伺服器沒有設定 ADMIN_TOKEN，無法加密保存金鑰。雲端請在部署平台設定 ADMIN_TOKEN；本機開發請把金鑰寫在 .env。</p>}
        {data.secrets.locked && <div className="bo-warn">現有的加密金鑰無法用目前的管理密碼解開（可能換過 ADMIN_TOKEN）。<button className="bo-btn" disabled={!canWrite} onClick={() => void resetAll()}>清除全部金鑰後重新輸入</button></div>}
      </div>

      <div className="bo-card"><h3>發布到 GitHub</h3><p className="bo-hint">頁首「發布」會用這組設定把後台修改提交回 repo，Render 偵測到新提交後自動重新部署。</p>
        <fieldset className="bo-form" disabled={!canWrite}>
          <Field label="GitHub repo" hint={<>例如 zhw56/everrich-ai-shopping-poc <From from={data.effective.github_repo.from} /></>}><input value={s.github_repo} onChange={(e) => set('github_repo', e.target.value)} placeholder="帳號/repo" /></Field>
          <Field label="分支" hint="留空＝main"><input value={s.github_branch} onChange={(e) => set('github_branch', e.target.value)} placeholder="main" /></Field>
        </fieldset>
        {secretRow('github_token', 'GitHub token', 'GitHub → Settings → Developer settings → Fine-grained tokens；Repository 只選這個 repo，權限只開 Contents 讀寫。')}
      </div>

      <div className="bo-card"><div className="bo-card-head"><h3>客戶畫像與 NBA</h3><Toggle checked={s.profile_enabled === 'true'} disabled={!canWrite} label="客戶畫像" onChange={(v) => set('profile_enabled', String(v))} /></div>
        <p className="bo-hint">開啟時，每輪對話結束後用專員模型在背景整理客戶需求（不影響回答速度，每輪多一次小模型呼叫），並讓 AI 依 NBA 規則在回答最後帶一句建議。關閉後不再建立或更新畫像，也不推薦。畫像只在後台「行銷」頁看得到。</p>
      </div>

      <div className="bo-card"><h3>分享網址</h3>
        <fieldset className="bo-form" disabled={!canWrite}>
          <Field label="前台網址" wide hint={<>比較表 QR code 會指向這個網址，例如 https://everrich-demo.onrender.com <From from={data.effective.share_base_url.from} /></>}><input value={s.share_base_url} onChange={(e) => set('share_base_url', e.target.value)} placeholder="https://…" inputMode="url" /></Field>
        </fieldset>
      </div>

      {NUM_GROUPS.map((g) => <div className="bo-card" key={g.title}><h3>{g.title}</h3><p className="bo-hint">{g.desc}</p>
        <fieldset className="bo-form" disabled={!canWrite}>{g.keys.map((k) => { const r = data.ranges[k]; return <Field key={k} label={r.label} hint={`範圍 ${r.min}–${r.max}`}><span className="bo-unit"><input type="number" min={r.min} max={r.max} value={s[k]} onChange={(e) => set(k, e.target.value)} /><em>{UNIT[k]}</em></span></Field>; })}</fieldset>
      </div>)}

      <div className="bo-card"><h3>只能在部署平台設定 <Badge>唯讀</Badge></h3>
        <dl className="bo-dl">
          <div><dt>ADMIN_TOKEN（後台密碼，也是金鑰的加密鑰匙）</dt><dd>{data.env.admin_token ? <Badge tone="green">已設定</Badge> : <Badge tone="red">未設定</Badge>}</dd></div>
          <div><dt>公開模式（PUBLIC_MODE）</dt><dd>{data.env.public_mode ? <Badge tone="blue">開啟（雲端）</Badge> : <Badge>關閉（本機）</Badge>}</dd></div>
        </dl>
        <p className="bo-hint">這兩項決定誰能進後台，所以不能在後台修改。</p>
      </div>
    </>}
  </Panel>;
}
