import { useMemo, useState } from 'react';
import { api, type TurnLog } from './api';
import { Badge, Feedback, Panel, Status, fmtTime, resultMsg, useLoad } from './ui';
import { TOOL_LABEL } from './Scenarios';
const AGENT_LABEL: Record<string, string> = { promo: '優惠', product: '商品', order: '訂單', knowledge: '知識' };

const FILTERS = [
  { k: 'all', label: '全部' },
  { k: 'flagged', label: '待改善清單' },
  { k: 'ungrounded', label: '無來源' },
  { k: 'handoff', label: '轉真人' },
  { k: 'scope', label: '超出範圍' },
  { k: 'error', label: '錯誤' },
] as const;
type F = (typeof FILTERS)[number]['k'];

function match(l: TurnLog, f: F) {
  const tools: string[] = l.meta?.tools ?? [];
  if (f === 'flagged') return l.flagged;
  if (f === 'ungrounded') return l.ok && !l.meta?.grounded && !l.meta?.guard;
  if (f === 'handoff') return tools.includes('handoff_to_human');
  if (f === 'scope') return String(l.meta?.guard ?? '').startsWith('out_of_scope');
  if (f === 'error') return !l.ok;
  return true;
}

function Row({ l, canWrite, onChange }: { l: TurnLog; canWrite: boolean; onChange: (l: TurnLog, msg: { ok: boolean; text: string }) => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(l.flag_note);
  const m = l.meta;
  async function flag(flagged: boolean) {
    const r = await api<TurnLog>(`/logs/${encodeURIComponent(l.id)}/flag`, { method: 'POST', body: { flagged, note } });
    onChange(r.ok ? r.data : l, resultMsg(r, flagged ? '已加入待改善清單' : '已移出待改善清單'));
  }
  return <article className={`bo-row ${l.flagged ? 'flag' : ''}`}>
    <div className="bo-row-main"><small>{fmtTime(l.at)}・對話 {l.session}</small><h3>{l.question}</h3><p className={open ? '' : 'clamp'}>{l.ok ? l.answer || '（沒有文字回覆，僅顯示卡片或驗證視窗）' : '（本輪發生錯誤）'}</p></div>
    <div className="bo-row-foot">
      {!l.ok ? <Badge tone="red">錯誤</Badge> : m?.grounded ? <Badge tone="green">有來源</Badge> : m?.guard ? <Badge>不需來源</Badge> : <Badge tone="amber">無來源</Badge>}
      {m?.guard && <Badge tone="blue">{String(m.guard).startsWith('handoff') ? '轉真人' : '超出範圍'}</Badge>}
      {m && <Badge>工具 {m.tool_calls} 次</Badge>}
      {m?.agents?.length > 0 && <Badge>專員 {m.agents.map((x: string) => AGENT_LABEL[x] ?? x).join('、')}</Badge>}
      {m && <Badge>{(m.ms / 1000).toFixed(1)} 秒</Badge>}
      {m?.prompt_version && <Badge>提示詞 {m.prompt_version}</Badge>}
      {l.flagged && <Badge tone="red">已標註錯誤</Badge>}
    </div>
    <div className="bo-row-actions"><button className="bo-btn" onClick={() => setOpen((x) => !x)} aria-expanded={open}>{open ? '收合' : '展開詳情'}</button>{canWrite && !l.flagged && <button className="bo-btn" onClick={() => setOpen(true)}>標註錯誤回答</button>}</div>
    {open && <div className="bo-detail">
      {m && <p className="bo-hint">使用工具：{m.tools?.length ? m.tools.map((t: string) => TOOL_LABEL[t] ?? t).join('、') : '無'}</p>}
      {canWrite && <div className="bo-inline"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="錯誤原因，例如：知識缺漏／搜尋失敗／理解錯誤" aria-label="標註原因" />{l.flagged ? <><button className="bo-btn" onClick={() => void flag(true)}>更新原因</button><button className="bo-btn" onClick={() => void flag(false)}>移出清單</button></> : <button className="bo-btn primary" onClick={() => void flag(true)}>加入待改善清單</button>}</div>}
      {l.flag_note && <p className="bo-hint">標註原因：{l.flag_note}</p>}
    </div>}
  </article>;
}

export function Logs({ canWrite }: { canWrite: boolean }) {
  const { data, setData, error, loading, reload } = useLoad<{ logs: TurnLog[] }>('/logs');
  const [f, setF] = useState<F>('all');
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const logs = useMemo(() => (data?.logs ?? []).filter((l) => match(l, f) && (!q.trim() || (l.question + l.answer).includes(q.trim()))), [data, f, q]);
  function exportJson() {
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `everrich-chat-logs-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  return <Panel title="對話紀錄" desc="這台展示伺服器啟動後的真實對話（只存在記憶體，重啟即清空）。存入前已遮罩手機號碼中間 4 碼與姓名第 2 字；標註為錯誤的回答會進入待改善清單。" actions={<div className="bo-inline compact"><button className="bo-btn" onClick={reload}>重新整理</button><button className="bo-btn" onClick={exportJson} disabled={!logs.length}>匯出 JSON</button></div>}>
    <Feedback msg={msg} />
    <div className="bo-toolbar"><div className="bo-seg" role="tablist" aria-label="篩選">{FILTERS.map((x) => <button key={x.k} role="tab" aria-selected={f === x.k} className={f === x.k ? 'on' : ''} onClick={() => setF(x.k)}>{x.label}<small>{(data?.logs ?? []).filter((l) => match(l, x.k)).length}</small></button>)}</div><label className="bo-search"><span className="sr-only">搜尋對話</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋問題或回答…" /></label></div>
    <Status loading={loading && !data} error={error} retry={reload} />
    {data && (logs.length ? <div className="bo-list">{logs.map((l) => <Row key={l.id} l={l} canWrite={canWrite} onChange={(nl, m) => { setMsg(m); setData({ logs: data.logs.map((x) => (x.id === nl.id ? nl : x)) }); }} />)}</div> : <p className="bo-state">{data.logs.length ? '沒有符合篩選的紀錄。' : '還沒有對話紀錄。到前台問幾個問題後，按「重新整理」。'}</p>)}
  </Panel>;
}
