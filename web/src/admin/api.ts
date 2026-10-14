/** 後台 API：一律經後端 /api/admin，前台不直接讀寫 data/ */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; errors: string[] };

const TOKEN_KEY = 'everrich-admin-token';
/** 雲端部署時的管理密碼；只存在這個分頁的 sessionStorage，關掉分頁就失效 */
export function getAdminToken(): string {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}
export function setAdminToken(token: string) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* 無法儲存時本次仍可用 */
  }
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown; signal?: AbortSignal }): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`/api/admin${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        ...(init?.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(getAdminToken() ? { 'x-admin-token': getAdminToken() } : {}),
      },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      signal: init?.signal,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) return { ok: false, error: json?.error ?? `HTTP_${res.status}`, errors: Array.isArray(json?.errors) ? json.errors : [] };
    // 寫入成功後通知頁首重新檢查「未發布變更」
    if ((init?.method ?? 'GET') !== 'GET') window.dispatchEvent(new Event('bo:changed'));
    return { ok: true, data: json.data as T };
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    return { ok: false, error: 'NETWORK', errors: ['無法連線到後端，請確認服務已啟動'] };
  }
}

export function errorText(r: { error: string; errors: string[] }): string {
  if (r.errors.length) return r.errors.join('；');
  const map: Record<string, string> = { READ_ONLY: '目前唯讀，請先輸入管理密碼', NOT_FOUND: '找不到資料', NETWORK: '無法連線到後端' };
  return map[r.error] ?? `操作失敗（${r.error}）`;
}

export type Source = { id: string; type: 'promo' | 'product' | 'faq'; title: string; url: string; enabled: boolean; last_checked: string | null; note: string };
export type SourceRow = Source & { refs: { promos: number; products: number; bundles: number; kb: number; total: number } };
export type PromptVersion = { version: string; created_at: string; author: string; note: string; content: string };
export type PromptsData = { store: { active_version: string; versions: PromptVersion[] } | null; store_error: string | null; active: { version: string; source: string; error: string | null }; fixed_rules: string };
export type Weights = { saving: number; fit: number; ease: number };
export type Ranking = { label: string; items: { rank: number; id: string; name: string; label: string; score: number; saving: number; gap: number }[] } | null;
export type TurnLog = { id: string; at: string; session: string; question: string; answer: string; ok: boolean; meta: any; flagged: boolean; flag_note: string };
export type LiveStats = { turns: number; errors: number; error_rate: number | null; price_turns: number; ungrounded_price_turns: number; zero_search_ratio: number | null; handoff_rate: number | null; search_turns: number; out_of_scope: number; flagged: number; turn_ms_p50: number | null; turn_ms_p95: number | null };

// ── T13 可編輯資料
export type SourceOption = { id: string; type: 'promo' | 'product' | 'faq'; title: string };
export type Refs = { users: number; bundles: number };
export type PromoRow = {
  id: string; name: string; channel: 'dutyfree' | 'home' | 'all'; promo_type: 'rate' | 'threshold' | 'points' | 'rebate';
  discount_rate: number | null; max_discount: number | null; min_spend: number; discount_amount: number | null; points: number | null;
  categories: string[]; exclude_categories: string[]; member_tiers: string[]; requirement: 'none' | 'member' | 'card' | 'app';
  valid_from: string | null; valid_to: string | null; label: string; condition_label: string;
  source_id: string; source_url: string; note: string; listed: boolean; mock: boolean; verified: boolean; mock_fields?: string[]; refs: Refs;
};
export type ProductRow = {
  id: string; name: string; brand: string; category: string; price: number; home_price: number | null; price_kind: string; channels: string[];
  size_label: string; alcohol_ml: number | null; tags: string[];
  source_id: string; source_url: string; note: string; listed: boolean; mock: boolean; verified: boolean; mock_fields?: string[]; refs: Refs;
};
export type BundleRow = {
  id: string; product_id: string; promo_id: string; channel: 'dutyfree' | 'home'; bundle_price: number; gift: string | null;
  valid_from: string | null; valid_to: string | null; source_id: string; source_url: string; note: string; listed: boolean; mock: boolean; verified: boolean; mock_fields?: string[]; refs: Refs;
};
export type CatalogData<R> = { rows: R[]; sources: SourceOption[] };
export type KbItem = { id: string; title: string; source_id: string; source_url: string; last_checked: string; valid_to: string | null; mock: boolean; body: string };
export type Shortcut = { icon: 'promo' | 'product' | 'order' | 'help'; title: string; subtitle: string; prompt: string };
export type FrontendConfig = {
  service_name: string; welcome_title: string; welcome_subtitle: string; shortcuts: Shortcut[]; suggestions: string[];
  composer_placeholder: string; footer_note: string; results_empty_title: string; results_empty_text: string; demo_hint: string;
};
export type Source3 = 'admin' | 'env' | 'none';
export type SettingsData = {
  settings: {
    max_tool_calls: number; max_agents: number; agent_timeout_seconds: number; daily_chat_limit: number; ip_chat_limit: number;
    model_orchestrator: string; model_agent: string; share_base_url: string; github_repo: string; github_branch: string;
    profile_enabled: boolean; llm_provider: 'anthropic' | 'inception'; inception_model: string;
  };
  ranges: Record<string, { min: number; max: number; label: string }>;
  effective: {
    model_orchestrator: { value: string | null; from: Source3 }; model_agent: { value: string | null; from: Source3 };
    anthropic_api_key: { from: Source3 }; inception_api_key: { from: Source3 }; github_token: { from: Source3 };
    github_repo: { value: string | null; from: Source3 }; share_base_url: { value: string | null; from: Source3 };
  };
  secrets: { can_store: boolean; file_exists: boolean; locked: boolean; masked: { anthropic_api_key: string | null; inception_api_key: string | null; github_token: string | null } };
  env: { public_mode: boolean; admin_token: boolean };
  provider: { value: 'anthropic' | 'inception'; from: 'env' | 'admin'; labels: Record<'anthropic' | 'inception', string>; inception_default_model: string; orchestrator: string | null; agent: string | null };
};
export type Scenario = { id: string; name: string; enabled: boolean; examples: string[]; need_verify: boolean; mode: 'single' | 'multi' | 'none'; tools: string[]; follow_up: string; answer_guide: string };
export type ScenariosData = { scenarios: Scenario[]; tools: string[]; prompt: string };
export type PublishStatus = { configured: boolean; repo: string | null; branch: string; changed: { path: string; label: string; created: boolean }[] };


// ── T15 客戶畫像／分眾／NBA（只在後台）
export type SegRef = { id: string; label: string };
export type ProfileSummary = {
  id: string; demo: boolean; user_id: string | null; updated_at: string; turns: number; first_question: string;
  intent_stage: string; sentiment: string; segments: SegRef[]; attr_count: number;
  top_action: { id: string; title: string; type: RuleType } | null; marketing_consent: boolean | null;
};
export type ProfileAttr = { key: string; label: string; value: string; source: 'stated' | 'inferred' | 'system'; confidence: number; evidence: string; at: string };
export type ProfileDetail = ProfileSummary & {
  topics: string[]; attributes: ProfileAttr[];
  actions: { id: string; title: string; type: RuleType; say: string; reason: string; score: number }[];
  offers_shown: { rule_id: string; turn: number; at: string }[];
};
export type Count = { name: string; count: number };
export type SegmentStats = {
  total: number; demo: number; consented: number;
  segments: { id: string; label: string; desc: string; count: number; consented: number }[];
  stages: Count[]; sentiments: Count[]; top_actions: Count[]; distributions: Record<string, Count[]>;
};
export type AudienceRow = { id: string; user_id: string | null; demo: boolean; segments: string[]; intent_stage: string; top_action: string | null; say: string | null; updated_at: string };
export type AudienceResult = { matched: number; excluded_no_consent: number; rows: AudienceRow[] };
export type RuleType = 'service' | 'retention' | 'offer' | 'acquisition';
export type NbaRule = { id: string; title: string; type: RuleType; when_all: string[]; when_none: string[]; priority: number; say: string; enabled: boolean };
export type NbaConfig = { policy: { max_offers_per_session: number; min_turns_between: number; suppress_segments: string[] }; rules: NbaRule[] };
export type NbaData = { config: NbaConfig; segments: { id: string; label: string; desc: string }[]; types: Record<RuleType, string>; matches: Record<string, number> };
