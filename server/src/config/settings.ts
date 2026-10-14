import { existsSync, readFileSync } from 'node:fs';
import { DATA_DIR } from '../data.js';
import { toJson, writeAtomic } from '../util/atomic.js';

/**
 * 後台可調整的系統參數（data/settings.json），每輪重新讀取。
 * 數字上限不得超過防護規則（6 次工具、3 個專員）；文字欄位留空代表沿用環境變數。
 * API 金鑰與 GitHub token 屬於機密，不放這裡，改存加密檔（config/secrets.ts）。
 */
export type Settings = {
  max_tool_calls: number;
  max_agents: number;
  agent_timeout_seconds: number;
  daily_chat_limit: number;
  ip_chat_limit: number;
  model_orchestrator: string;
  model_agent: string;
  share_base_url: string;
  github_repo: string;
  github_branch: string;
  /** T15：是否在後台建立客戶畫像 */
  profile_enabled: boolean;
  /** 模型供應商：anthropic（正式展示）／inception（測試省錢）；環境變數 LLM_PROVIDER 優先 */
  llm_provider: 'anthropic' | 'inception';
  /** Inception 模型名稱，留空＝mercury-2 */
  inception_model: string;
};

export const SETTINGS_FILE = DATA_DIR + 'settings.json';

export const SETTINGS_RANGES = {
  max_tool_calls: { min: 1, max: 6, label: '每輪工具呼叫上限' },
  max_agents: { min: 1, max: 3, label: '每輪專員上限' },
  agent_timeout_seconds: { min: 5, max: 30, label: '專員逾時秒數' },
  daily_chat_limit: { min: 0, max: 10000, label: '全站每日對話上限（公開模式）' },
  ip_chat_limit: { min: 0, max: 500, label: '每個 IP 每 10 分鐘對話上限（公開模式）' },
} as const;

const TEXT_RULES: Record<'model_orchestrator' | 'model_agent' | 'inception_model' | 'share_base_url' | 'github_repo' | 'github_branch', { label: string; ok: (v: string) => boolean; hint: string }> = {
  model_orchestrator: { label: '主控模型', ok: (v) => /^[a-z0-9][a-z0-9.\-]{2,80}$/.test(v), hint: '小寫英數、點與連字號，例如 claude-sonnet-5' },
  model_agent: { label: '專員模型', ok: (v) => /^[a-z0-9][a-z0-9.\-]{2,80}$/.test(v), hint: '小寫英數、點與連字號，例如 claude-haiku-4-5-20251001' },
  inception_model: { label: 'Inception 模型', ok: (v) => /^[a-z0-9][a-z0-9.\-]{2,80}$/.test(v), hint: '例如 mercury-2' },
  share_base_url: {
    label: '分享網址',
    ok: (v) => {
      try {
        const u = new URL(v);
        return (u.protocol === 'https:' || u.protocol === 'http:') && u.pathname === '/' && !u.search && !u.hash && !u.username;
      } catch {
        return false;
      }
    },
    hint: '只填網址開頭，例如 https://everrich-demo.onrender.com',
  },
  github_repo: { label: 'GitHub repo', ok: (v) => /^[\w.-]+\/[\w.-]+$/.test(v), hint: '格式為 帳號/repo，例如 zhw56/everrich-ai-shopping-poc' },
  github_branch: { label: 'GitHub 分支', ok: (v) => /^[\w./-]{1,100}$/.test(v), hint: '例如 main' },
};
const TEXT_KEYS = Object.keys(TEXT_RULES) as (keyof typeof TEXT_RULES)[];

export function defaultSettings(): Settings {
  const env = (k: string, d: number) => (process.env[k] !== undefined && Number.isFinite(Number(process.env[k])) ? Number(process.env[k]) : d);
  return {
    max_tool_calls: 6,
    max_agents: 3,
    agent_timeout_seconds: 15,
    daily_chat_limit: env('DAILY_CHAT_LIMIT', 300),
    ip_chat_limit: env('IP_CHAT_LIMIT', 20),
    model_orchestrator: '',
    model_agent: '',
    share_base_url: '',
    github_repo: '',
    github_branch: '',
    profile_enabled: true,
    llm_provider: 'anthropic',
    inception_model: '',
  };
}

export function validateSettings(x: unknown): string[] {
  const s = x as Record<string, unknown>;
  if (!s || typeof s !== 'object' || Array.isArray(s)) return ['設定必須是物件'];
  const errors: string[] = [];
  for (const [k, r] of Object.entries(SETTINGS_RANGES)) {
    const v = s[k];
    if (!Number.isInteger(v) || (v as number) < r.min || (v as number) > r.max) errors.push(`${r.label}必須是 ${r.min} 到 ${r.max} 的整數`);
  }
  for (const k of TEXT_KEYS) {
    const v = s[k];
    if (typeof v !== 'string') errors.push(`${TEXT_RULES[k].label}必須是文字`);
    else if (v && !TEXT_RULES[k].ok(v)) errors.push(`${TEXT_RULES[k].label}格式不正確：${TEXT_RULES[k].hint}`);
  }
  if (typeof s.profile_enabled !== 'boolean') errors.push('客戶畫像開關必須是是或否');
  if (s.llm_provider !== 'anthropic' && s.llm_provider !== 'inception') errors.push('模型供應商只能是 anthropic 或 inception');
  const extra = Object.keys(s).filter((k) => !(k in SETTINGS_RANGES) && !(TEXT_KEYS as string[]).includes(k) && k !== 'profile_enabled' && k !== 'llm_provider');
  if (extra.length) errors.push(`不認得的欄位：${extra.join('、')}`);
  return errors;
}

/** 每輪讀取；舊檔缺少的欄位補預設值；格式錯誤時用預設值，對話不中斷 */
export function loadSettings(file = SETTINGS_FILE): Settings {
  try {
    if (!existsSync(file)) return defaultSettings();
    const parsed = { ...defaultSettings(), ...JSON.parse(readFileSync(file, 'utf8')) };
    return validateSettings(parsed).length ? defaultSettings() : (parsed as Settings);
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(input: unknown, file = SETTINGS_FILE): { ok: true; settings: Settings } | { ok: false; error: string; errors: string[] } {
  const patch = input && typeof input === 'object' ? { ...(input as Record<string, unknown>) } : {};
  for (const k of TEXT_KEYS) if (typeof patch[k] === 'string') patch[k] = (patch[k] as string).trim();
  // 分享網址統一成「https://網域/」的形式
  if (typeof patch.share_base_url === 'string' && patch.share_base_url) patch.share_base_url = patch.share_base_url.replace(/\/+$/, '') + '/';
  const merged = { ...loadSettings(file), ...patch };
  const errors = validateSettings(merged);
  if (errors.length) return { ok: false, error: 'INVALID_SETTINGS', errors };
  writeAtomic(file, toJson(merged));
  return { ok: true, settings: merged as Settings };
}
