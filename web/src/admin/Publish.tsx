import { useEffect, useState } from 'react';
import { api, errorText, type PublishStatus } from './api';
import { Drawer, Errors } from './ui';

/** 頁首的「發布」按鈕：把後台改過的資料檔提交回 GitHub，Render 重新部署後保留 */
export function PublishButton({ canWrite }: { canWrite: boolean }) {
  const [status, setStatus] = useState<PublishStatus | null>(null);
  const [open, setOpen] = useState(false);
  const refresh = () => api<PublishStatus>('/publish').then((r) => r.ok && setStatus(r.data)).catch(() => {});
  useEffect(() => {
    void refresh();
    const on = () => void refresh();
    window.addEventListener('bo:changed', on);
    return () => window.removeEventListener('bo:changed', on);
  }, []);
  const n = status?.changed.length ?? 0;
  return <>
    <button className={`bo-btn ${n ? 'primary' : ''}`} onClick={() => { void refresh(); setOpen(true); }}>{n ? `發布 ${n} 項變更` : '發布'}</button>
    {open && status && <PublishDrawer status={status} canWrite={canWrite} onClose={() => setOpen(false)} onDone={(s) => setStatus(s)} />}
  </>;
}

function PublishDrawer({ status, canWrite, onClose, onDone }: { status: PublishStatus; canWrite: boolean; onClose: () => void; onDone: (s: PublishStatus) => void }) {
  const [message, setMessage] = useState(`後台更新：${status.changed.map((c) => c.label).join('、') || '資料'}`);
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<string[]>([]);
  const [conflict, setConflict] = useState(false);
  const [done, setDone] = useState<{ url: string | null; files: string[] } | null>(null);

  async function go() {
    setBusy(true);
    const r = await api<{ commit: string; url: string | null; files: string[]; status: PublishStatus }>('/publish', { method: 'POST', body: { message, force } });
    setBusy(false);
    if (r.ok) { setDone({ url: r.data.url, files: r.data.files }); setErrs([]); onDone(r.data.status); }
    else { setErrs(r.errors.length ? r.errors : [errorText(r)]); setConflict(r.error === 'CONFLICT'); }
  }

  return <Drawer title="發布到 GitHub" sub="把後台修改寫回 repo，雲端重新部署後就會保留" onClose={onClose}
    footer={!done && <><span className="bo-spacer" /><button className="bo-btn" onClick={onClose}>關閉</button>{canWrite && status.configured && <button className="bo-btn primary" disabled={busy || !status.changed.length || !message.trim()} onClick={() => void go()}>{busy ? '發布中…' : '確認發布'}</button>}</>}>
    {done ? <div className="bo-done"><strong>已發布</strong><p>{done.files.length ? `已提交：${done.files.join('、')}。` : 'GitHub 上已經是同樣的內容。'}Render 偵測到新提交後會自動重新部署，大約 2 到 3 分鐘，期間服務可能短暫中斷。</p>{done.url && <a href={done.url} target="_blank" rel="noreferrer">在 GitHub 查看這次提交 ↗</a>}<button className="bo-btn" onClick={onClose}>完成</button></div> : <>
      <Errors list={errs} />
      <h4 className="bo-sub">這次部署之後修改過的資料</h4>
      {status.changed.length ? <ul className="bo-changed">{status.changed.map((c) => <li key={c.path}><b>{c.label}</b><code>{c.path}</code>{c.created && <em>新檔案</em>}</li>)}</ul> : <p className="bo-hint">目前沒有未發布的變更。</p>}
      {!status.configured ? <div className="bo-note"><strong>尚未設定 GitHub 連線。</strong>請到 <a href="#settings">系統參數</a> 填寫 GitHub repo 並保存 GitHub token（Fine-grained，只授權這個 repo 的 Contents 讀寫）。</div> : <>
        <p className="bo-hint">目標：<code>{status.repo}</code> 的 <code>{status.branch}</code> 分支</p>
        <label className="bo-field"><span className="bo-label">提交說明</span><input value={message} onChange={(e) => setMessage(e.target.value)} maxLength={120} disabled={!canWrite} /></label>
        {conflict && <label className="bo-check"><input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />我確認要用後台版本覆蓋 GitHub 上的檔案</label>}
        <div className="bo-note">發布後 Render 會自動重新部署，期間服務可能中斷 2 到 3 分鐘；對話紀錄會清空。</div>
      </>}
      {!canWrite && <p className="bo-hint">輸入管理密碼後才能發布。</p>}
    </>}
  </Drawer>;
}
