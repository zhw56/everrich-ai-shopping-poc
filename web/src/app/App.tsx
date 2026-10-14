import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Cards } from './Cards';
import { MessageText } from './MessageText';
import { Icon } from './Icon';
import { useFrontConfig } from './config';
import { chat } from './sse';
import { demoChat } from './demo';
import { createId, safeUrl } from './types';
import type { Action, CardSet, ChatEvent, Message, Source } from './types';

function Modal({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const el = ref.current; const previous = document.activeElement as HTMLElement; el?.showModal(); return () => { el?.close(); previous?.focus(); }; }, []);
  return <dialog ref={ref} className="fx-modal" aria-labelledby="dialog-title" onCancel={(e) => { e.preventDefault(); close(); }} onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
    <div className="fx-modal-inner">
      <div className="fx-modal-head"><h2 id="dialog-title">{title}</h2><button className="fx-icon-btn" onClick={close} aria-label="關閉視窗"><Icon name="close" size={18} /></button></div>
      {children}
    </div>
  </dialog>;
}

const blank = (role: Message['role'], text = ''): Message => ({ id: createId(), role, text, cards: [], sources: [], actions: [] });
const isDemo = new URLSearchParams(window.location.search).get('demo') === '1';

export function App() {
  const config = useFrontConfig();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [verified, setVerified] = useState(false);
  const [source, setSource] = useState<Source | null>(null);
  const [verifyReason, setVerifyReason] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [verifyError, setVerifyError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resume, setResume] = useState('');
  const session = useRef(createId());
  const active = useRef<AbortController | null>(null);
  const verifyController = useRef<AbortController | null>(null);
  const pending = useRef('');
  const lastQuestion = useRef('');
  const scrolling = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const follow = useRef(true);
  const latest = [...messages].reverse().find((m) => m.role === 'assistant');
  const result = [...messages].reverse().find((m) => m.cards.length);

  useEffect(() => { if (messages.length && follow.current) scrolling.current?.scrollTo({ top: scrolling.current.scrollHeight, behavior: 'instant' as ScrollBehavior }); }, [messages, status]);
  useEffect(() => () => { active.current?.abort(); verifyController.current?.abort(); }, []);
  useEffect(() => { const el = input.current; if (!el) return; el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 160)}px`; }, [draft]);
  useEffect(() => { if (resume && !busy && !verifying) { setResume(''); void send(resume); } }, [resume, busy, verifying]);

  function patch(id: string, fn: (message: Message) => Message) { setMessages((all) => all.map((m) => (m.id === id ? fn(m) : m))); }

  async function send(text: string) {
    const question = text.trim();
    if (!question || active.current || verifying) return;
    const controller = new AbortController();
    active.current = controller;
    const response = blank('assistant');
    lastQuestion.current = question;
    setMessages((all) => [...all, blank('user', question), response]);
    setDraft(''); setBusy(true); setStatus('正在理解你的問題'); follow.current = true;
    let failed = false;
    const receive = ({ event, data }: ChatEvent) => {
      if (active.current !== controller) return;
      const d = data as Record<string, unknown>;
      if (event === 'status' && typeof d?.text === 'string') setStatus(d.text.replace(/…$/, ''));
      if (event === 'delta' && typeof d?.text === 'string') patch(response.id, (m) => ({ ...m, text: m.text + d.text }));
      if (event === 'cards' && Array.isArray(d?.items) && ['promo', 'product', 'bundle', 'order'].includes(String(d.type))) patch(response.id, (m) => ({ ...m, cards: [...m.cards, data as CardSet] }));
      if (event === 'sources' && Array.isArray(data)) patch(response.id, (m) => ({ ...m, sources: [...m.sources, ...data.filter((s) => typeof s?.url === 'string' && typeof s?.title === 'string')] }));
      if (event === 'action' && d?.type) {
        const action = { ...d, payload: d.payload ?? {} } as Action;
        patch(response.id, (m) => ({ ...m, actions: [...m.actions, action] }));
        if (action.type === 'verify') { setVerified(false); pending.current = question; setVerifyError(''); setVerifyReason(action.payload.reason || '查詢會員資料前，請先完成驗證。'); }
      }
      if (event === 'error') { failed = true; patch(response.id, (m) => ({ ...m, error: typeof d?.message === 'string' ? d.message : '服務暫時無法使用。' })); }
    };
    try {
      if (isDemo) await demoChat(question, verified, receive, controller.signal);
      else await chat(session.current, question, receive, controller.signal);
      if (!failed) patch(response.id, (m) => (!m.text && !m.cards.length && !m.actions.length ? { ...m, error: '這次沒有取得回覆，請重試。' } : m));
    } catch (error) {
      if (active.current === controller) patch(response.id, (m) => ({ ...m, error: controller.signal.aborted ? '已停止這次回覆。' : error instanceof Error ? error.message : '連線失敗，請稍後再試。' }));
    } finally {
      if (active.current === controller) { active.current = null; setBusy(false); setStatus(''); }
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (verifying || busy) return;
    setVerifyError(''); setVerifying(true);
    const controller = new AbortController();
    verifyController.current = controller;
    try {
      let next: string | undefined;
      if (isDemo) {
        if (phone.replace(/\D/g, '') !== '0900000003' || otp !== '123456') throw new Error('示範模式請使用 0900-000-003 與驗證碼 123456。');
        next = pending.current;
      } else {
        const response = await fetch('/api/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: session.current, phone, otp }), signal: controller.signal });
        if (!response.ok) throw new Error('驗證服務暫時無法使用，請稍後再試。');
        const data = await response.json();
        if (!data.ok) throw new Error(data.error === 'LOCKED' ? '驗證次數過多，請 10 分鐘後再試。' : '手機號碼或驗證碼不正確，請再確認。');
        next = data.resume_message || pending.current;
      }
      setVerified(true); setVerifyReason(null); setOtp(''); setPhone(''); pending.current = '';
      setResume(next || '我已完成驗證，請繼續。');
    } catch (error) {
      if (!controller.signal.aborted) setVerifyError(error instanceof Error ? error.message : '驗證失敗，請重試。');
    } finally {
      if (verifyController.current === controller) { verifyController.current = null; setVerifying(false); }
    }
  }

  function reset() {
    active.current?.abort(); active.current = null; verifyController.current?.abort();
    session.current = createId();
    setMessages([]); setBusy(false); setStatus(''); setVerified(false); setDraft(''); setResume(''); pending.current = ''; setResetOpen(false);
  }

  const sourceChips = (items: Source[]) => !!items.length && <div className="fx-sources" aria-label="回答來源"><span>來源</span>{items.map((s, i) => <button key={`${s.url}-${i}`} onClick={() => setSource(s)}><b>{i + 1}</b>{s.title}</button>)}</div>;

  function actions(m: Message) {
    return m.actions.map((a, i) => {
      if (a.type === 'quick_replies' && m.id === latest?.id && !m.error) return <div className="fx-replies" key={i}>{a.payload.options?.map((option) => <button key={option} disabled={busy || verifying} onClick={() => void send(option)}>{option}</button>)}</div>;
      if (a.type === 'verify' && !verified) return <button className="fx-btn primary" disabled={busy} key={i} onClick={() => { pending.current = messages[messages.indexOf(m) - 1]?.text ?? ''; setVerifyReason(a.payload.reason || '查詢會員資料前，請先完成驗證。'); }}><Icon name="lock" size={16} />驗證會員後繼續</button>;
      if (a.type === 'compare' && safeUrl(a.payload.url, true)) return <a className="fx-btn" key={i} href={safeUrl(a.payload.url, true)} target="_blank" rel="noreferrer">開啟比較表<Icon name="link" size={15} /></a>;
      if (a.type === 'handoff') return <div className="fx-handoff" key={i}><span>已建立模擬客服工單</span><strong>{a.payload.ticket_id ?? a.payload.id}</strong>{(a.payload.notice ?? a.payload.message) && <p>{a.payload.notice ?? a.payload.message}</p>}</div>;
      return null;
    });
  }

  const welcome = <section className="fx-welcome">
    <p className="fx-eyebrow"><i />EVER RICH 昇恆昌・{config.service_name}</p>
    <h1>{config.welcome_title}</h1>
    <p className="fx-lead">{config.welcome_subtitle}</p>
    <div className="fx-shortcuts">{config.shortcuts.map((s) => <button key={s.title + s.prompt} onClick={() => void send(s.prompt)}>
      <span className="fx-shortcut-icon"><Icon name={s.icon} /></span>
      <span className="fx-shortcut-text"><strong>{s.title}</strong><small>{s.subtitle}</small></span>
      <span className="fx-shortcut-go"><Icon name="arrowRight" size={16} /></span>
    </button>)}</div>
    {config.suggestions.length > 0 && <div className="fx-suggest"><span>也可以這樣問</span>{config.suggestions.map((q) => <button key={q} onClick={() => void send(q)}>{q}</button>)}</div>}
  </section>;

  const conversation = <div className="fx-messages" aria-label="對話紀錄" aria-live="polite">{messages.map((m) => <article className={`fx-msg ${m.role}`} key={m.id}>
    {m.role === 'user' ? <div className="fx-bubble">{m.text}</div> : <>
      <div className="fx-avatar" aria-hidden="true"><i /></div>
      <div className="fx-answer">
        {m.text && <MessageText text={m.text} />}
        {m.id === latest?.id && busy && <div className="fx-thinking" role="status"><span className="fx-dots"><i /><i /><i /></span>{status}</div>}
        {m.cards.length > 0 && <div className="fx-inline-cards">{m.cards.map((set, i) => <Cards key={i} set={set} onSource={setSource} />)}</div>}
        {sourceChips(m.sources)}
        {actions(m)}
        {m.error && <div className="fx-error" role="alert"><p>{m.error}</p>{!busy && <button onClick={() => void send(messages[messages.indexOf(m) - 1]?.text ?? lastQuestion.current)}>重新送出</button>}</div>}
      </div>
    </>}
  </article>)}</div>;

  return <div className="fx-app">
    <header className="fx-top">
      <a className="fx-brand" href={isDemo ? '/?demo=1' : '/'} aria-label="回到首頁"><i />昇恆昌<span>{config.service_name}</span></a>
      <div className="fx-top-right">
        {verified && <span className="fx-pill ok"><Icon name="check" size={14} />已驗證</span>}
        <a className="fx-pill" href={isDemo ? '/' : '/?demo=1'} title={isDemo ? '切換到 AI 服務' : '不呼叫 AI 的固定示範'}>{isDemo ? '示範模式' : 'AI 模式'}</a>
        <button className="fx-icon-btn" onClick={() => (messages.length ? setResetOpen(true) : reset())} aria-label="開始新對話" title="新對話"><Icon name="plus" /></button>
      </div>
    </header>
    <main className={`fx-main${messages.length ? ' has-messages' : ''}`}>
      <section className="fx-chat">
        <div className="fx-scroll" ref={scrolling} onScroll={() => { const el = scrolling.current!; follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100; }}>
          <div className="fx-column">{messages.length ? conversation : welcome}</div>
        </div>
        <div className="fx-composer-wrap">
          <form className="fx-composer" onSubmit={(e) => { e.preventDefault(); void send(draft); }}>
            <label className="sr-only" htmlFor="message">輸入問題</label>
            <textarea ref={input} id="message" rows={1} maxLength={1000} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={config.composer_placeholder} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(draft); } }} />
            {busy ? <button type="button" className="fx-send stop" aria-label="停止回覆" onClick={() => active.current?.abort()}><Icon name="stop" size={18} /></button>
              : <button className="fx-send" type="submit" aria-label="送出" disabled={!draft.trim() || verifying}><Icon name="arrowUp" size={18} stroke={2} /></button>}
          </form>
          <p className="fx-footnote">{config.footer_note}</p>
        </div>
      </section>
      <aside className="fx-results" aria-label="查詢結果">
        {result ? <>
          <p className="fx-eyebrow">查詢結果</p>
          {result.cards.map((set, i) => <Cards key={`${result.id}-${i}`} set={set} onSource={setSource} layout="stack" />)}
          {sourceChips(result.sources)}
          <p className="fx-results-note">含展示資料的內容尚待人工核對，點選來源可查看出處。</p>
        </> : <div className="fx-results-empty">
          <div className="fx-ghost-cards" aria-hidden="true"><i /><i /><i /></div>
          <h2>{config.results_empty_title}</h2>
          <p>{config.results_empty_text}</p>
          <p className="fx-trust"><Icon name="lock" size={15} />會員資料需驗證 RICHCLUB 會員後才會查詢</p>
        </div>}
      </aside>
    </main>

    {source && <Modal title="資料來源" close={() => setSource(null)}>
      <h3 className="fx-source-title">{source.title}</h3>
      <blockquote className="fx-quote">{source.cited_text || '這筆資料沒有引用原文，請開啟來源頁查看。'}</blockquote>
      <p className="fx-muted">來源頁供追溯資料出處，不代表已核對展示價格。</p>
      {safeUrl(source.url) ? <a className="fx-source-link" href={safeUrl(source.url)} target="_blank" rel="noreferrer"><span>{source.url}</span><Icon name="link" size={16} /></a> : <p className="fx-error">這個來源網址無法安全開啟。</p>}
    </Modal>}

    {verifyReason !== null && <Modal title="驗證 RICHCLUB 會員" close={() => { if (!verifying) { setVerifyReason(null); setOtp(''); } }}>
      <p className="fx-muted">{verifyReason}</p>
      <form className="fx-form" onSubmit={verify}>
        <label htmlFor="phone">會員手機號碼</label>
        <input autoFocus id="phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="0900-000-001" value={phone} onChange={(e) => setPhone(e.target.value)} required pattern="[0-9\- ]{10,14}" maxLength={14} />
        <label htmlFor="otp">驗證碼</label>
        <input id="otp" autoComplete="one-time-code" inputMode="numeric" placeholder="6 位數字" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} required pattern="[0-9]{6}" maxLength={6} />
        <p className="fx-hint">{isDemo ? '示範模式：0900-000-003（會員 C），驗證碼 123456。' : config.demo_hint}</p>
        {verifyError && <p className="fx-error" role="alert">{verifyError}</p>}
        <button className="fx-btn primary block" disabled={busy || verifying}>{verifying ? '驗證中' : busy ? '等候回覆完成' : '驗證並繼續'}</button>
        <button type="button" className="fx-btn ghost block" disabled={busy || verifying} onClick={() => { setVerifyReason(null); setOtp(''); setPhone(''); pending.current = ''; setResume('我不想驗證，想自己說這次的預算和想買的東西'); }}>不驗證，自己說預算</button>
      </form>
    </Modal>}

    {resetOpen && <Modal title="開始新對話？" close={() => setResetOpen(false)}>
      <p className="fx-muted">目前的對話與會員驗證狀態會清除。</p>
      <div className="fx-modal-actions"><button className="fx-btn ghost" onClick={() => setResetOpen(false)}>取消</button><button className="fx-btn primary" onClick={reset}>開始新對話</button></div>
    </Modal>}
  </div>;
}
