import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { loadSettings } from '../config/settings.js';
import { inceptionClient } from './inception.js';
import type { LlmClient } from './types.js';

/**
 * 模型供應商切換：Claude（正式展示）／Inception Mercury（開發測試省錢）。
 * 優先序：環境變數 LLM_PROVIDER（本機 .env、測試腳本）＞後台系統參數 llm_provider（雲端）＞預設 anthropic。
 * 官網搜尋（search_official_web）用的是 Claude 內建網頁搜尋，不受這個切換影響。
 */
export type Provider = 'anthropic' | 'inception';
export const PROVIDERS: Provider[] = ['anthropic', 'inception'];
export const PROVIDER_LABEL: Record<Provider, string> = { anthropic: 'Claude（正式展示）', inception: 'Inception Mercury（測試省錢）' };
// mercury-2.5 為預覽版，2026-10-06 實測常卡住不回應（40 秒逾時），預設改用穩定的 mercury-2
export const INCEPTION_DEFAULT_MODEL = 'mercury-2';

const isProvider = (x: unknown): x is Provider => x === 'anthropic' || x === 'inception';

export function providerSource(): { value: Provider; from: 'env' | 'admin' } {
  const env = process.env.LLM_PROVIDER;
  if (isProvider(env)) return { value: env, from: 'env' };
  return { value: loadSettings().llm_provider, from: 'admin' };
}
export const activeProvider = (): Provider => providerSource().value;

export function apiKeyFor(p: Provider = activeProvider()): string | undefined {
  return p === 'inception' ? config.inceptionApiKey : config.anthropicApiKey;
}

/** 依目前供應商取得主控或專員（含畫像抽取）要用的模型名稱 */
export function modelFor(role: 'orchestrator' | 'agent', p: Provider = activeProvider()): string | undefined {
  if (p === 'inception') return loadSettings().inception_model || process.env.INCEPTION_MODEL || INCEPTION_DEFAULT_MODEL;
  return role === 'orchestrator' ? config.modelOrchestrator : config.modelAgent;
}

let cache: { id: string; client: LlmClient } | null = null;
/** 目前供應商的 client；後台換了金鑰或供應商就重建 */
export function getLlm(p: Provider = activeProvider()): LlmClient {
  const key = apiKeyFor(p);
  if (!key) throw new Error('NO_API_KEY');
  const id = p + ':' + key;
  if (!cache || cache.id !== id) cache = { id, client: p === 'inception' ? inceptionClient(key) : (new Anthropic({ apiKey: key }) as unknown as LlmClient) };
  return cache.client;
}

export type { LlmClient } from './types.js';
