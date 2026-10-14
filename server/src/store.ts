import type { Comparison } from './comparison.js';

/** POC 用的記憶體儲存；重啟伺服器即清空 */
export const comparisons = new Map<string, Comparison>();
export const tickets = new Map<string, unknown>();

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
