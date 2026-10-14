import { useEffect, useState, type FormEvent } from 'react';
import { api, setAdminToken } from './api';
import { BundlesPage, ProductsPage, PromosPage } from './Catalog';
import { Dashboard } from './Dashboard';
import { FrontendSettings } from './FrontendSettings';
import { Knowledge } from './Knowledge';
import { Logs } from './Logs';
import { NbaPage, ProfilesPage, SegmentsPage } from './Marketing';
import { Prompts } from './Prompts';
import { PublishButton } from './Publish';
import { Scenarios } from './Scenarios';
import { Sources } from './Sources';
import { SystemSettings } from './SystemSettings';
import { Weights } from './Weights';
import './admin.css';

const GROUPS = [
  { label: '總覽', items: [{ k: 'dashboard', label: '儀表板' }, { k: 'logs', label: '對話紀錄' }] },
  { label: '行銷', items: [{ k: 'profiles', label: '客戶畫像' }, { k: 'segments', label: '分眾與名單' }, { k: 'nba', label: 'NBA 規則' }] },
  { label: '商品與知識', items: [{ k: 'promos', label: '優惠活動' }, { k: 'products', label: '商品' }, { k: 'bundles', label: '組合優惠價' }, { k: 'knowledge', label: '知識庫' }] },
  { label: 'AI 設定', items: [{ k: 'scenarios', label: '情境設定' }, { k: 'prompts', label: 'Prompt' }, { k: 'weights', label: '推薦規則' }, { k: 'sources', label: '搜尋來源' }] },
  { label: '網站', items: [{ k: 'frontend', label: '前台設定' }, { k: 'settings', label: '系統參數' }] },
] as const;
type K = (typeof GROUPS)[number]['items'][number]['k'];
const ALL: { k: K; label: string }[] = GROUPS.flatMap((g) => g.items as readonly { k: K; label: string }[]);
const fromHash = (): K => ALL.find((s) => `#${s.k}` === window.location.hash)?.k ?? 'dashboard';

export function AdminApp() {
  const [section, setSection] = useState<K>(fromHash);
  const [canWrite, setCanWrite] = useState<boolean | null>(null);
  const [token, setToken] = useState('');
  const [loginErr, setLoginErr] = useState(false);
  useEffect(() => {
    const on = () => { setSection(fromHash()); window.scrollTo({ top: 0 }); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const checkAccess = () => api<{ can_write: boolean }>('/access').then((r) => { const ok = r.ok ? r.data.can_write : false; setCanWrite(ok); return ok; }).catch(() => false);
  useEffect(() => { void checkAccess(); }, []);
  const label = ALL.find((s) => s.k === section)?.label ?? '';
  const group = GROUPS.find((g) => g.items.some((i) => i.k === section))?.label ?? '';
  useEffect(() => { document.title = `${label}｜昇恆昌 AI 購物小幫手後台`; }, [label]);
  async function login(e: FormEvent) {
    e.preventDefault();
    setAdminToken(token.trim());
    setToken('');
    const ok = await checkAccess();
    setLoginErr(!ok);
    if (!ok) setAdminToken('');
  }
  const write = canWrite === true;
  const P = { canWrite: write };
  return <div className="bo-shell">
    <aside className="bo-side">
      <a href="#dashboard" className="bo-brand"><i />昇恆昌<small>購物小幫手後台</small></a>
      <nav className="bo-nav" aria-label="後台功能">{GROUPS.map((g) => <div key={g.label} className="bo-nav-group"><span>{g.label}</span>{g.items.map((s) => <a key={s.k} href={`#${s.k}`} aria-current={section === s.k ? 'page' : undefined}>{s.label}</a>)}</div>)}</nav>
      <a className="bo-front" href="/" target="_blank" rel="noreferrer">開啟前台 ↗</a>
    </aside>
    <div className="bo-col">
      <header className="bo-top">
        <div className="bo-crumb"><span>{group}</span><i>／</i><b>{label}</b></div>
        <div className="bo-top-actions">
          {canWrite === false && <form className="bo-login" onSubmit={login}><span className="bo-lock">唯讀</span><input type="password" value={token} onChange={(e) => { setToken(e.target.value); setLoginErr(false); }} placeholder="管理密碼" aria-label="管理密碼" aria-invalid={loginErr} /><button type="submit" className="bo-btn">解鎖編輯</button>{loginErr && <em role="alert">密碼不正確</em>}</form>}
          {canWrite && <span className="bo-unlocked">可編輯</span>}
          <PublishButton canWrite={write} />
        </div>
      </header>
      <main className="bo-main">
        {section === 'dashboard' && <Dashboard />}
        {section === 'logs' && <Logs {...P} />}
        {section === 'profiles' && <ProfilesPage {...P} />}
        {section === 'segments' && <SegmentsPage />}
        {section === 'nba' && <NbaPage {...P} />}
        {section === 'promos' && <PromosPage {...P} />}
        {section === 'products' && <ProductsPage {...P} />}
        {section === 'bundles' && <BundlesPage {...P} />}
        {section === 'knowledge' && <Knowledge {...P} />}
        {section === 'scenarios' && <Scenarios {...P} />}
        {section === 'prompts' && <Prompts {...P} />}
        {section === 'weights' && <Weights {...P} />}
        {section === 'sources' && <Sources {...P} />}
        {section === 'frontend' && <FrontendSettings {...P} />}
        {section === 'settings' && <SystemSettings {...P} />}
        <p className="bo-foot">POC 展示後台・儀表板業務數字與標示「展示」的客戶畫像為展示假資料，其餘頁面為真實讀寫。</p>
      </main>
    </div>
  </div>;
}
