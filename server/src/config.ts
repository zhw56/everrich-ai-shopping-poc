import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { loadSettings } from './config/settings.js';
import { getSecret } from './config/secrets.js';

loadEnv({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });

const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT 必須是 1 到 65535 之間的整數。');
}

/**
 * 執行設定。API 金鑰與模型名稱以後台設定優先（每次讀取都即時生效），
 * 後台沒填時才用環境變數；PORT、PUBLIC_MODE、ADMIN_TOKEN 只能由環境變數設定。
 */
export const config = {
  port,
  get anthropicApiKey(): string | undefined {
    return getSecret('anthropic_api_key') || process.env.ANTHROPIC_API_KEY || undefined;
  },
  /** 開發測試用的 Inception（Mercury）金鑰 */
  get inceptionApiKey(): string | undefined {
    return getSecret('inception_api_key') || process.env.INCEPTION_API_KEY || undefined;
  },
  get modelOrchestrator(): string | undefined {
    return loadSettings().model_orchestrator || process.env.MODEL_ORCHESTRATOR || undefined;
  },
  get modelAgent(): string | undefined {
    return loadSettings().model_agent || process.env.MODEL_AGENT || undefined;
  },
  /** 部署到雲端時設為 1：後台只認 ADMIN_TOKEN、對話加上流量限制 */
  publicMode: process.env.PUBLIC_MODE === '1',
};

/** 每個設定實際採用的值與來源（給後台顯示，不含機密明文） */
export function effectiveSource() {
  const s = loadSettings();
  return {
    model_orchestrator: { value: config.modelOrchestrator ?? null, from: s.model_orchestrator ? 'admin' : process.env.MODEL_ORCHESTRATOR ? 'env' : 'none' },
    model_agent: { value: config.modelAgent ?? null, from: s.model_agent ? 'admin' : process.env.MODEL_AGENT ? 'env' : 'none' },
    anthropic_api_key: { from: getSecret('anthropic_api_key') ? 'admin' : process.env.ANTHROPIC_API_KEY ? 'env' : 'none' },
    inception_api_key: { from: getSecret('inception_api_key') ? 'admin' : process.env.INCEPTION_API_KEY ? 'env' : 'none' },
    github_token: { from: getSecret('github_token') ? 'admin' : process.env.GITHUB_TOKEN ? 'env' : 'none' },
    github_repo: { value: s.github_repo || process.env.GITHUB_REPO || null, from: s.github_repo ? 'admin' : process.env.GITHUB_REPO ? 'env' : 'none' },
    share_base_url: { value: s.share_base_url || process.env.SHARE_BASE_URL || null, from: s.share_base_url ? 'admin' : process.env.SHARE_BASE_URL ? 'env' : 'none' },
  };
}
