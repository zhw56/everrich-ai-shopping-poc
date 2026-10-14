import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { api, errorText, type ApiResult } from './api';

export function useLoad<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  useEffect(() => {
    if (path === null) { setLoading(false); return; }
    const c = new AbortController();
    setLoading(true);
    api<T>(path, { signal: c.signal })
      .then((r) => {
        if (c.signal.aborted) return;
        if (r.ok) { setData(r.data); setError(''); } else setError(errorText(r));
        setLoading(false);
      })
      .catch(() => {});
    return () => c.abort();
  }, [path, tick]);
  return { data, setData, error, loading, reload };
}

export function Panel({ title, desc, actions, children }: { title: string; desc?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return <section className="bo-panel"><div className="bo-panel-head"><div><h2>{title}</h2>{desc && <p>{desc}</p>}</div>{actions}</div>{children}</section>;
}

export function Badge({ tone = 'gray', children }: { tone?: 'gray' | 'green' | 'red' | 'amber' | 'blue'; children: ReactNode }) {
  return <span className={`bo-badge ${tone}`}>{children}</span>;
}

export function Status({ loading, error, retry }: { loading: boolean; error: string; retry?: () => void }) {
  if (loading) return <p className="bo-state" role="status">載入中…</p>;
  if (error) return <div className="bo-state bo-error" role="alert"><p>{error}</p>{retry && <button className="bo-btn" onClick={retry}>重新載入</button>}</div>;
  return null;
}

/** 顯示操作結果；成功與失敗分色，失敗時列出後端的驗證錯誤 */
export function Feedback({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return <p className={`bo-feedback ${msg.ok ? 'ok' : 'bad'}`} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>;
}

export function resultMsg<T>(r: ApiResult<T>, okText: string) {
  return r.ok ? { ok: true, text: okText } : { ok: false, text: errorText(r) };
}

export const fmtTime = (iso: string) => new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
export const nt = (n: number | null | undefined) => (typeof n === 'number' ? n.toLocaleString('zh-TW') : '—');
export const trust = (x: { mock?: boolean; verified?: boolean }) => (x.verified ? <Badge tone="green">已人工核對</Badge> : x.mock ? <Badge tone="amber">含展示假資料</Badge> : <Badge>待人工核對</Badge>);

/** 右側抽屜：編輯單筆資料用；Esc 或點背景關閉 */
export function Drawer({ title, sub, onClose, children, footer }: { title: string; sub?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', key); document.body.style.overflow = ''; prev?.focus(); };
  }, []);
  // 以 portal 掛到 body：頁首有 backdrop-filter，會讓 fixed 定位被限制在頁首內
  return createPortal(<div className="bo-drawer-wrap" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="bo-drawer" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
      <div className="bo-drawer-head"><div><h2>{title}</h2>{sub && <p>{sub}</p>}</div><button className="bo-icon-btn" onClick={onClose} aria-label="關閉">×</button></div>
      <div className="bo-drawer-body">{children}</div>
      {footer && <div className="bo-drawer-foot">{footer}</div>}
    </div>
  </div>, document.body);
}

export function Field({ label, hint, wide, children }: { label: string; hint?: ReactNode; wide?: boolean; children: ReactNode }) {
  return <label className={`bo-field${wide ? ' wide' : ''}`}><span className="bo-label">{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className={`bo-switch${checked ? ' on' : ''}`} onClick={() => onChange(!checked)}><i /></button>;
}

export function Errors({ list }: { list: string[] }) {
  if (!list.length) return null;
  return <div className="bo-errors" role="alert"><strong>無法儲存</strong><ul>{list.map((e) => <li key={e}>{e}</li>)}</ul></div>;
}

/** 二段式刪除：第一次按變成「確認刪除」 */
export function DeleteButton({ onConfirm, disabled, title }: { onConfirm: () => void; disabled?: boolean; title?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(t); }, [armed]);
  return <button type="button" className={`bo-btn ${armed ? 'danger-solid' : 'danger'}`} disabled={disabled} title={title} onClick={() => (armed ? onConfirm() : setArmed(true))}>{armed ? '確認刪除' : '刪除'}</button>;
}

export const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });

