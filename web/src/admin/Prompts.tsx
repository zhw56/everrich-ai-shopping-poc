import { useEffect, useMemo, useState } from 'react';
import { api, type PromptsData } from './api';
import { diffLines } from './diff';
import { Badge, Feedback, Panel, Status, fmtTime, resultMsg, useLoad } from './ui';

export function Prompts({ canWrite }: { canWrite: boolean }) {
  const { data, setData, error, loading, reload } = useLoad<PromptsData>('/prompts');
  const versions = data?.store?.versions ?? [];
  const active = data?.store?.active_version ?? data?.active.version ?? '';
  const activeContent = versions.find((v) => v.version === active)?.content ?? '';
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState('');
  const [activate, setActivate] = useState(true);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [showRules, setShowRules] = useState(false);

  useEffect(() => {
    if (!data?.store) return;
    setDraft((d) => d || activeContent);
    const list = data.store.versions;
    const latest = list[list.length - 1]?.version ?? '';
    const other = latest !== active ? latest : list.length > 1 ? list[list.length - 2].version : latest;
    setFrom((f) => f || (other === latest ? active : other));
    setTo((t) => t || (other === latest ? latest : active));
  }, [data]);

  const diff = useMemo(() => {
    const a = versions.find((v) => v.version === from)?.content;
    const b = versions.find((v) => v.version === to)?.content;
    return a !== undefined && b !== undefined ? diffLines(a, b) : [];
  }, [versions, from, to]);
  const draftChanged = draft.trim() !== activeContent.trim();
  const idx = versions.findIndex((v) => v.version === active);
  const previous = idx > 0 ? versions[idx - 1].version : null;

  async function save() {
    setBusy(true);
    const r = await api<PromptsData>('/prompts', { method: 'POST', body: { content: draft, note, activate } });
    setBusy(false);
    setMsg(resultMsg(r, activate ? '已儲存為新版本並啟用，下一輪對話生效' : '已儲存為新版本（未啟用）'));
    if (r.ok) { setData(r.data); setNote(''); const vs = r.data.store?.versions ?? []; setTo(vs[vs.length - 1]?.version ?? ''); setFrom(vs[vs.length - 2]?.version ?? ''); }
  }
  async function use(version: string, text: string) {
    const r = await api<PromptsData>('/prompts/active', { method: 'POST', body: { version } });
    setMsg(resultMsg(r, text));
    if (r.ok) { setData(r.data); setDraft(r.data.store?.versions.find((v) => v.version === version)?.content ?? ''); }
  }

  return <Panel title="Prompt 管理" desc="系統提示詞 = 固定防護規則（程式內，不可修改）＋ 下方可編輯內容（data/prompts.json）＋ 目前狀態。每次儲存都新增一個版本、不覆蓋舊版，啟用後下一輪對話立即使用。">
    <Feedback msg={msg} />
    <Status loading={loading} error={error} retry={reload} />
    {data && <>
      {data.store_error && <p className="bo-warn">prompts.json 讀取失敗（{data.store_error}），對話目前使用內建 v1，且不允許寫入以免覆蓋。</p>}
      <div className="bo-card"><div className="bo-card-head"><h3>固定防護規則 <Badge>唯讀</Badge></h3><button className="bo-btn" onClick={() => setShowRules((x) => !x)} aria-expanded={showRules}>{showRules ? '收合' : '展開'}</button></div>{showRules ? <pre className="bo-pre">{data.fixed_rules}</pre> : <p className="bo-hint">語言、數字只能來自工具、價格與優惠須有來源、會員資料先驗證、只回答昇恆昌、菸酒額度提醒、工具與專員上限、轉真人等規則。後台內容與這段衝突時以這段為準。</p>}</div>
      <div className="bo-grid2 prompts">
        <div className="bo-card"><h3>版本清單</h3><ol className="bo-versions">{[...versions].reverse().map((v) => <li key={v.version} className={v.version === active ? 'on' : ''}><div><strong>{v.version}</strong>{v.version === active && <Badge tone="green">啟用中</Badge>}<p>{v.note || '（無說明）'}</p><small>{v.author}・{fmtTime(v.created_at)}</small></div>{canWrite && v.version !== active && <button className="bo-btn" onClick={() => void use(v.version, `已切換為 ${v.version}`)}>啟用</button>}</li>)}</ol>
          {canWrite && previous && <button className="bo-btn wide" onClick={() => void use(previous, `已回滾到 ${previous}`)}>一鍵回滾到上一版（{previous}）</button>}
        </div>
        <div className="bo-card"><h3>編輯可編輯內容</h3><textarea className="bo-editor" value={draft} onChange={(e) => setDraft(e.target.value)} rows={16} disabled={!canWrite} aria-label="提示詞內容" />
          <div className="bo-inline"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="版本說明，例如：S4 追問改成先問預算" aria-label="版本說明" disabled={!canWrite} /></div>
          <label className="bo-check"><input type="checkbox" checked={activate} onChange={(e) => setActivate(e.target.checked)} disabled={!canWrite} />儲存後立即啟用</label>
          <div className="bo-form-actions"><button className="bo-btn" disabled={!draftChanged} onClick={() => setDraft(activeContent)}>還原成啟用中版本</button><button className="bo-btn primary" disabled={!canWrite || busy || !draftChanged || !draft.trim()} onClick={() => void save()}>{busy ? '儲存中…' : '儲存為新版本'}</button></div>
        </div>
      </div>
      <div className="bo-card"><div className="bo-card-head"><h3>版本差異</h3><div className="bo-inline compact"><select value={from} onChange={(e) => setFrom(e.target.value)} aria-label="比較基準版本">{versions.map((v) => <option key={v.version}>{v.version}</option>)}</select><span>→</span><select value={to} onChange={(e) => setTo(e.target.value)} aria-label="比較目標版本">{versions.map((v) => <option key={v.version}>{v.version}</option>)}</select></div></div>
        {from === to ? <p className="bo-hint">選擇兩個不同版本即可比較。</p> : <pre className="bo-diff">{diff.map((l, i) => <div key={i} className={l.kind}><span aria-hidden="true">{l.kind === 'add' ? '+' : l.kind === 'del' ? '−' : ' '}</span>{l.kind !== 'same' && <span className="sr-only">{l.kind === 'add' ? '新增：' : '刪除：'}</span>}{l.text || ' '}</div>)}</pre>}
      </div>
    </>}
  </Panel>;
}
