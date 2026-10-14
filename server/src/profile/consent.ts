import { existsSync, readFileSync } from 'node:fs';
import { DATA_DIR } from '../data.js';

/**
 * 行銷同意（個資法第 19、20 條）：正式環境來自 CRM 的同意紀錄；展示以 data/marketing_consents.json 模擬。
 * 只有同意者會出現在可匯出的行銷名單；匿名訪客同意狀態未知，只進統計。
 */
const FILE = DATA_DIR + 'marketing_consents.json';
export function marketingConsentOf(userId: string | null): boolean | null {
  if (!userId) return null;
  try {
    if (!existsSync(FILE)) return null;
    const map = JSON.parse(readFileSync(FILE, 'utf8')) as Record<string, boolean>;
    return typeof map[userId] === 'boolean' ? map[userId] : null;
  } catch {
    return null;
  }
}
