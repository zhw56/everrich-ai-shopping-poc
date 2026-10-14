import { useEffect, useMemo, useState } from 'react';
import { api, errorText, type AudienceResult, type Count, type NbaConfig, type NbaData, type NbaRule, type ProfileDetail, type ProfileSummary, type RuleType, type SegmentStats } from './api';
import { Badge, DeleteButton, Drawer, Errors, Feedback, Field, Panel, Status, Toggle, fmtTime, resultMsg, useLoad } from './ui';

/** T15：行銷（客戶畫像、分眾與名單、NBA 規則）。畫像只在後台，客戶在前台看不到。 */

const SOURCE = {
  stated: { tone: 'green' as const, text: '客戶說的' },
  inferred: { tone: 'amber' as const, text: 'AI 推測' },
  system: { tone: 'blue' as const, text: '會員資料' },
};
const TYPE_TONE: Record<RuleType, 'blue' | 'amber' | 'green' | 'red'> = { service: 'blue', retention: 'amber', offer: 'green', acquisition: 'red' };
const TYPE_TEXT: Record<RuleType, string> = { service: '服務關懷', retention: '會員經營', offer: '商品與優惠推薦', acquisition: '入會招攬' };
const SENT_TONE: Record<string, 'green' | 'gray' | 'red'> = { 正向: 'green', 中性: 'gray', 負向: 'red' };
const STAGES = ['瀏覽', '比較', '準備購買', '服務需求', '流失風險'];
const consentBadge = (c: boolean | null) => (c === true ? <Badge tone="green">同意</Badge> : c === false ? <Badge tone="red">拒絕</Badge> : <Badge>未取得</Badge>);
const MEMBER: Record<string, string> = { 'mock-user-a': '展示會員 A', 'mock-user-b': '展示會員 B', 'mock-user-c': '展示會員 C' };
const who = (p: { user_id: string | null; demo: boolean }) => (p.user_id ? MEMBER[p.user_id] ?? `會員 ${p.user_id}` : '未驗證訪客');

// ── 客戶畫像
function ProfileDrawer({ id, canWrite, onClose, onDeleted }: { id: string; canWrite: boolean; onClose: () => void; onDeleted: (list: ProfileSummary[]) => void }) {
  const { data: p, error, loading } = useLoad<ProfileDetail>(`/profiles/${encodeURIComponent(id)}`);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function del() {
    const r = await api<{ profiles: ProfileSummary[] }>(`/profiles/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (r.ok) onDeleted(r.data.profiles); else setMsg(resultMsg(r, ''));
  }
  return <Drawer title={p ? who(p) : '客戶畫像'} sub={p && <>{p.id}・{p.turns} 輪對話・更新於 {fmtTime(p.updated_at)}{p.demo && '・展示範例'}</>} onClose={onClose}
    footer={canWrite && p && <div className="bo-toolbar"><span className="bo-hint">客戶要求刪除個資時使用（個資法第 11 條）</span><DeleteButton onConfirm={() => void del()} /></div>}>
    <Feedback msg={msg} />
    <Status loading={loading && !p} error={error} />
    {p && <>
      <dl className="bo-dl">
        <div><dt>意圖階段</dt><dd>{p.intent_stage}</dd></div>
        <div><dt>情緒</dt><dd><Badge tone={SENT_TONE[p.sentiment] ?? 'gray'}>{p.sentiment}</Badge></dd></div>
        <div><dt>行銷同意</dt><dd>{consentBadge(p.marketing_consent)}</dd></div>
        <div><dt>第一句話</dt><dd>{p.first_question || '—'}</dd></div>
      </dl>
      <section className="bo-stack"><h4 className="bo-sub">客群</h4><div className="bo-tags">{p.segments.length ? p.segments.map((s) => <i key={s.id}>{s.label}</i>) : <span className="bo-hint">尚未符合任何客群</span>}</div></section>
      <section className="bo-stack"><h4 className="bo-sub">需求屬性（{p.attributes.length}）</h4>
        {p.attributes.length ? <ul className="bo-attrs">{p.attributes.map((a) => <li key={a.key}>
          <div><span>{a.label}</span><strong>{a.value}</strong></div>
          <div className="bo-attr-meta"><Badge tone={SOURCE[a.source].tone}>{SOURCE[a.source].text}{a.source === 'inferred' && ` ${Math.round(a.confidence * 100)}%`}</Badge>{a.evidence && <q>{a.evidence}</q>}</div>
        </li>)}</ul> : <p className="bo-hint">還沒有整理出需求。</p>}
      </section>
      <section className="bo-stack"><h4 className="bo-sub">建議下一步（NBA）</h4>
        {p.actions.length ? <ol className="bo-actions">{p.actions.map((a, i) => <li key={a.id} className={i === 0 ? 'top' : ''}><div><Badge tone={TYPE_TONE[a.type]}>{TYPE_TEXT[a.type]}</Badge><strong>{a.title}</strong>{p.offers_shown.some((o) => o.rule_id === a.id) && <Badge>對話中已提過</Badge>}</div><p>「{a.say}」</p><small>{a.reason}・優先序 {a.score}</small></li>)}</ol> : <p className="bo-hint">目前沒有符合的規則。</p>}
      </section>
    </>}
  </Drawer>;
}

export function ProfilesPage({ canWrite }: { canWrite: boolean }) {
  const { data, setData, error, loading, reload } = useLoad<{ profiles: ProfileSummary[] }>('/profiles');
  const [f, setF] = useState<'all' | 'live' | 'demo'>('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const all = data?.profiles ?? [];
  const rows = useMemo(() => all.filter((p) => (f === 'all' || (f === 'demo') === p.demo) && (!q.trim() || [p.first_question, p.user_id ?? '', ...p.segments.map((s) => s.label)].join(' ').includes(q.trim()))), [all, f, q]);
  return <Panel title="客戶畫像" desc="AI 在對話中逐步整理的需求（漸進式建檔），只在後台使用，客戶在前台看不到。每個屬性標示來源：客戶說的（附原句）、AI 推測（附信心）、會員資料（驗證後讀取）；健康、宗教、政治等敏感資訊一律不記錄。" actions={<button className="bo-btn" onClick={reload}>重新整理</button>}>
    <Feedback msg={msg} />
    <div className="bo-toolbar"><div className="bo-seg" role="tablist" aria-label="篩選">{([['all', '全部'], ['live', '真實對話'], ['demo', '展示範例']] as const).map(([k, label]) => <button key={k} role="tab" aria-selected={f === k} className={f === k ? 'on' : ''} onClick={() => setF(k)}>{label}<small>{all.filter((p) => k === 'all' || (k === 'demo') === p.demo).length}</small></button>)}</div><label className="bo-search"><span className="sr-only">搜尋</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋問題、客群…" /></label></div>
    <Status loading={loading && !data} error={error} retry={reload} />
    {data && (rows.length ? <div className="bo-table-wrap"><table className="bo-table">
      <thead><tr><th>客戶</th><th>第一句話</th><th>意圖</th><th>客群</th><th>建議下一步</th><th>行銷同意</th><th>更新</th><th className="act" /></tr></thead>
      <tbody>{rows.map((p) => <tr key={p.id}>
        <td><strong>{who(p)}</strong><small>{p.id}{p.demo ? '・展示' : ''}</small></td>
        <td className="bo-cell-wrap">{p.first_question || '—'}</td>
        <td>{p.intent_stage} {p.sentiment === '負向' && <Badge tone="red">負向</Badge>}</td>
        <td className="bo-cell-wrap"><div className="bo-tags">{p.segments.slice(0, 3).map((s) => <i key={s.id}>{s.label}</i>)}{p.segments.length > 3 && <i>+{p.segments.length - 3}</i>}</div></td>
        <td className="bo-cell-wrap">{p.top_action ? <><Badge tone={TYPE_TONE[p.top_action.type]}>{TYPE_TEXT[p.top_action.type]}</Badge> {p.top_action.title}</> : '—'}</td>
        <td>{consentBadge(p.marketing_consent)}</td>
        <td><small>{fmtTime(p.updated_at).split(' ')[0]}</small></td>
        <td className="act"><button className="bo-btn" onClick={() => setOpen(p.id)}>查看</button></td>
      </tr>)}</tbody></table></div>
      : <p className="bo-state">{all.length ? '沒有符合篩選的畫像。' : '還沒有畫像。到前台聊幾句後按「重新整理」。'}</p>)}
    {open && <ProfileDrawer id={open} canWrite={canWrite} onClose={() => setOpen(null)} onDeleted={(list) => { setOpen(null); setData({ profiles: list }); setMsg({ ok: true, text: '已刪除這筆畫像' }); }} />}
  </Panel>;
}

// ── 分眾與名單
function Bars({ rows, total }: { rows: Count[]; total: number }) {
  if (!rows.length) return <p className="bo-hint">尚無資料</p>;
  return <ul className="bo-bars">{rows.slice(0, 6).map((r) => <li key={r.name}><span title={r.name}>{r.name}</span><div className="bo-bar"><i style={{ width: `${total ? Math.round((r.count / total) * 100) : 0}%` }} /></div><b>{r.count}</b></li>)}</ul>;
}

function csv(rows: AudienceResult['rows']) {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['畫像編號', '會員', '展示', '客群', '意圖階段', '建議行動', '建議說法', '更新時間'];
  const body = rows.map((r) => [r.id, r.user_id ?? '', r.demo ? '是' : '否', r.segments.join('、'), r.intent_stage, r.top_action ?? '', r.say ?? '', r.updated_at].map(esc).join(','));
  // 加 BOM，Excel 開啟才不會亂碼
  const blob = new Blob(['﻿' + [head.map(esc).join(','), ...body].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `everrich-audience-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function SegmentsPage() {
  const { data: s, error, loading, reload } = useLoad<SegmentStats>('/segments');
  const [all, setAll] = useState<string[]>([]);
  const [none, setNone] = useState<string[]>([]);
  const [stages, setStages] = useState<string[]>([]);
  const [demo, setDemo] = useState(true);
  const [res, setRes] = useState<AudienceResult | null>(null);
  const [err, setErr] = useState('');
  const flip = (list: string[], set: (x: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  useEffect(() => {
    const c = new AbortController();
    const t = setTimeout(() => {
      api<AudienceResult>('/audience', { method: 'POST', body: { all, none, stages, include_demo: demo }, signal: c.signal })
        .then((r) => { if (r.ok) { setRes(r.data); setErr(''); } else setErr(errorText(r)); })
        .catch(() => {});
    }, 150);
    return () => { clearTimeout(t); c.abort(); };
  }, [all.join(), none.join(), stages.join(), demo, s]);
  const D: [string, string][] = [['customer_type', '旅客類型'], ['category_interest', '感興趣分類'], ['gift_for', '送禮對象'], ['brand_preference', '偏好品牌'], ['pain_points', '痛點']];
  return <>
    <Panel title="分眾總覽" desc="客群由畫像屬性以程式規則計算（可解釋、可重現），不是 AI 自由判斷。" actions={<button className="bo-btn" onClick={reload}>重新整理</button>}>
      <Status loading={loading && !s} error={error} retry={reload} />
      {s && <>
        <div className="bo-tiles">
          <article className="bo-tile"><h3>畫像總數</h3><strong>{s.total}</strong><p>其中展示範例 {s.demo} 筆</p></article>
          <article className="bo-tile"><h3>可行銷（已同意）</h3><strong>{s.consented}</strong><p>{s.total ? Math.round((s.consented / s.total) * 100) : 0}% 同意接收行銷</p></article>
          <article className="bo-tile"><h3>準備購買</h3><strong>{s.stages.find((x) => x.name === '準備購買')?.count ?? 0}</strong><p>高購買意圖，優先跟進</p></article>
          <article className={`bo-tile ${(s.sentiments.find((x) => x.name === '負向')?.count ?? 0) ? 'alert' : ''}`}><h3>情緒負向</h3><strong>{s.sentiments.find((x) => x.name === '負向')?.count ?? 0}</strong><p>暫停推銷，先服務關懷</p></article>
        </div>
        <div className="bo-grid2">
          <div className="bo-card"><h3>客群人數</h3><ul className="bo-bars">{s.segments.filter((x) => x.count).sort((a, b) => b.count - a.count).map((x) => <li key={x.id} title={x.desc}><span>{x.label}</span><div className="bo-bar"><i style={{ width: `${Math.round((x.count / s.total) * 100)}%` }} /></div><b>{x.count}</b></li>)}</ul><p className="bo-hint">滑鼠移到客群名稱可看判斷條件。</p></div>
          <div className="bo-card"><h3>意圖階段</h3><Bars rows={s.stages} total={s.total} /><h3>建議下一步 Top</h3><Bars rows={s.top_actions} total={s.total} /></div>
          {D.map(([k, label]) => <div className="bo-card" key={k}><h3>{label}</h3><Bars rows={s.distributions[k] ?? []} total={s.total} /></div>)}
        </div>
      </>}
    </Panel>
    <Panel title="行銷名單" desc="勾選條件即時篩選。名單只包含同意接收行銷的客戶（個資法第 19、20 條：行銷使用須在特定目的內，客戶拒絕後應停止）；未同意者只計數、不列出。">
      {s && <div className="bo-card">
        <div className="bo-split3">
          <fieldset><legend className="bo-label">必須符合（全部）</legend><div className="bo-chips">{s.segments.map((x) => <button key={x.id} type="button" aria-pressed={all.includes(x.id)} disabled={none.includes(x.id)} onClick={() => flip(all, setAll, x.id)}>{x.label}</button>)}</div></fieldset>
          <fieldset><legend className="bo-label">排除</legend><div className="bo-chips">{s.segments.map((x) => <button key={x.id} type="button" className="neg" aria-pressed={none.includes(x.id)} disabled={all.includes(x.id)} onClick={() => flip(none, setNone, x.id)}>{x.label}</button>)}</div></fieldset>
          <fieldset><legend className="bo-label">意圖階段（不選＝不限）</legend><div className="bo-chips">{STAGES.map((x) => <button key={x} type="button" aria-pressed={stages.includes(x)} onClick={() => flip(stages, setStages, x)}>{x}</button>)}</div>
            <label className="bo-check"><input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} />包含展示範例</label></fieldset>
        </div>
      </div>}
      {err && <p className="bo-warn">{err}</p>}
      {res && <>
        <div className="bo-toolbar"><p className="bo-hint">符合條件 <b>{res.matched}</b> 人，可行銷 <b>{res.rows.length}</b> 人，因未同意行銷排除 <b>{res.excluded_no_consent}</b> 人。</p><button className="bo-btn primary" disabled={!res.rows.length} onClick={() => csv(res.rows)}>匯出 CSV</button></div>
        {res.rows.length ? <div className="bo-table-wrap"><table className="bo-table"><thead><tr><th>客戶</th><th>客群</th><th>意圖</th><th>建議行動與說法</th></tr></thead>
          <tbody>{res.rows.map((r) => <tr key={r.id}><td><strong>{who(r)}</strong><small>{r.id}{r.demo ? '・展示' : ''}</small></td><td><div className="bo-tags">{r.segments.map((x) => <i key={x}>{x}</i>)}</div></td><td>{r.intent_stage}</td><td className="bo-cell-wrap"><strong>{r.top_action ?? '—'}</strong>{r.say && <span className="bo-hint">「{r.say}」</span>}</td></tr>)}</tbody></table></div>
          : <p className="bo-state">沒有可行銷的客戶。</p>}
      </>}
    </Panel>
  </>;
}

// ── NBA 規則
const blank = (n: number): NbaRule => ({ id: `rule-${n}`, title: '', type: 'offer', when_all: [], when_none: ['unhappy'], priority: 50, say: '', enabled: true });

export function NbaPage({ canWrite }: { canWrite: boolean }) {
  const { data, setData, error, loading, reload } = useLoad<NbaData>('/nba');
  const [c, setC] = useState<NbaConfig | null>(null);
  const [edit, setEdit] = useState<number | null>(null);
  const [errs, setErrs] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setC(structuredClone(data.config)); }, [data]);
  const dirty = !!data && !!c && JSON.stringify(c) !== JSON.stringify(data.config);
  const label = new Map(data?.segments.map((s) => [s.id, s.label]) ?? []);
  const setRule = (i: number, patch: Partial<NbaRule>) => setC((x) => (x ? { ...x, rules: x.rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) } : x));
  const setPolicy = (patch: Partial<NbaConfig['policy']>) => setC((x) => (x ? { ...x, policy: { ...x.policy, ...patch } } : x));
  const flip = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  async function save() {
    if (!c) return;
    setBusy(true);
    const r = await api<NbaData>('/nba', { method: 'PUT', body: c });
    setBusy(false);
    if (r.ok) { setData(r.data); setErrs([]); setMsg({ ok: true, text: '已儲存，下一輪對話立即使用' }); setEdit(null); }
    else { setErrs(r.errors.length ? r.errors : [errorText(r)]); setMsg(null); }
  }
  const rule = edit !== null ? c?.rules[edit] : null;
  const sorted = c ? c.rules.map((r, i) => ({ r, i })).sort((a, b) => b.r.priority - a.r.priority) : [];
  return <Panel title="NBA 規則" desc="下一步最佳行動（Next Best Action）：客群符合條件時，AI 會在回答最後自然帶一句建議，後台畫像也會列出。服務關懷與商業推薦一起依優先序排序；接觸頻率政策避免過度推銷。" actions={canWrite && <div className="bo-inline compact"><button className="bo-btn" disabled={!dirty || busy} onClick={() => data && setC(structuredClone(data.config))}>還原</button><button className="bo-btn primary" disabled={!dirty || busy} onClick={() => void save()}>{busy ? '儲存中…' : '儲存規則'}</button></div>}>
    <Feedback msg={msg} />
    <Errors list={errs} />
    <Status loading={loading && !data} error={error} retry={reload} />
    {data && c && <>
      <div className="bo-card"><h3>接觸頻率政策</h3>
        <fieldset className="bo-form" disabled={!canWrite}>
          <Field label="每段對話最多推薦" hint="服務關懷不計入"><span className="bo-unit"><input type="number" min={0} max={10} value={c.policy.max_offers_per_session} onChange={(e) => setPolicy({ max_offers_per_session: Number(e.target.value) })} /><em>次</em></span></Field>
          <Field label="兩次推薦至少間隔" hint="避免每句都在推銷"><span className="bo-unit"><input type="number" min={0} max={20} value={c.policy.min_turns_between} onChange={(e) => setPolicy({ min_turns_between: Number(e.target.value) })} /><em>輪</em></span></Field>
          <Field label="這些客群暫停推銷" wide><div className="bo-chips">{data.segments.map((s) => <button key={s.id} type="button" aria-pressed={c.policy.suppress_segments.includes(s.id)} onClick={() => setPolicy({ suppress_segments: flip(c.policy.suppress_segments, s.id) })}>{s.label}</button>)}</div></Field>
        </fieldset>
      </div>
      <div className="bo-table-wrap"><table className="bo-table">
        <thead><tr><th>啟用</th><th>規則</th><th>條件</th><th className="num">優先序</th><th className="num">目前符合</th><th className="act">{canWrite && <button className="bo-btn" onClick={() => { setC({ ...c, rules: [...c.rules, blank(c.rules.length + 1)] }); setEdit(c.rules.length); }}>新增規則</button>}</th></tr></thead>
        <tbody>{sorted.map(({ r, i }) => <tr key={i} className={r.enabled ? '' : 'off'}>
          <td><Toggle checked={r.enabled} disabled={!canWrite} label={`啟用 ${r.title}`} onChange={(v) => setRule(i, { enabled: v })} /></td>
          <td className="bo-cell-wrap"><strong><Badge tone={TYPE_TONE[r.type]}>{data.types[r.type]}</Badge> {r.title || '（未命名）'}</strong><span className="bo-hint">「{r.say}」</span></td>
          <td className="bo-cell-wrap"><div className="bo-tags">{r.when_all.map((s) => <i key={s}>{label.get(s)}</i>)}{r.when_none.map((s) => <i key={s} className="neg">非{label.get(s)}</i>)}</div></td>
          <td className="num">{r.priority}</td>
          <td className="num">{data.matches[r.id] ?? '—'} 人</td>
          <td className="act"><button className="bo-btn" onClick={() => setEdit(i)}>{canWrite ? '編輯' : '查看'}</button></td>
        </tr>)}</tbody>
      </table></div>
      {!canWrite && <p className="bo-hint">此裝置為唯讀，輸入管理密碼後可以編輯。</p>}
    </>}
    {rule && edit !== null && data && c && <Drawer title={rule.title || '新規則'} sub={<code>{rule.id}</code>} onClose={() => setEdit(null)}
      footer={canWrite && <div className="bo-toolbar"><DeleteButton onConfirm={() => { setC({ ...c, rules: c.rules.filter((_, j) => j !== edit) }); setEdit(null); }} /><button className="bo-btn primary" onClick={() => setEdit(null)}>完成（記得儲存規則）</button></div>}>
      <fieldset className="bo-form" disabled={!canWrite}>
        <Field label="名稱"><input value={rule.title} maxLength={40} onChange={(e) => setRule(edit, { title: e.target.value })} /></Field>
        <Field label="代號" hint="小寫英數與連字號"><input value={rule.id} onChange={(e) => setRule(edit, { id: e.target.value })} /></Field>
        <Field label="類型"><select value={rule.type} onChange={(e) => setRule(edit, { type: e.target.value as RuleType })}>{(Object.keys(data.types) as RuleType[]).map((t) => <option key={t} value={t}>{data.types[t]}</option>)}</select></Field>
        <Field label="優先序" hint="1–100，越大越優先"><input type="number" min={1} max={100} value={rule.priority} onChange={(e) => setRule(edit, { priority: Number(e.target.value) })} /></Field>
        <Field label="AI 建議說法" wide hint="AI 會改寫成自然口吻，放在回答最後；120 字內"><textarea rows={3} maxLength={120} value={rule.say} onChange={(e) => setRule(edit, { say: e.target.value })} /></Field>
        <Field label="必須符合的客群（全部）" wide><div className="bo-chips">{data.segments.map((s) => <button key={s.id} type="button" title={s.desc} aria-pressed={rule.when_all.includes(s.id)} disabled={rule.when_none.includes(s.id)} onClick={() => setRule(edit, { when_all: flip(rule.when_all, s.id) })}>{s.label}</button>)}</div></Field>
        <Field label="排除客群" wide><div className="bo-chips">{data.segments.map((s) => <button key={s.id} type="button" className="neg" title={s.desc} aria-pressed={rule.when_none.includes(s.id)} disabled={rule.when_all.includes(s.id)} onClick={() => setRule(edit, { when_none: flip(rule.when_none, s.id) })}>{s.label}</button>)}</div></Field>
      </fieldset>
    </Drawer>}
  </Panel>;
}
