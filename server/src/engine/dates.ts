/** valid_to 為 null 代表未公告截止日，不視為過期，也不代表永久有效 */
export function isExpired(validTo: string | null, asOf: string): boolean {
  return validTo !== null && validTo < asOf;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
}

/** 日期加減天數，回傳 YYYY-MM-DD */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);
}

/** 免稅購物網：出境前 45 天開始可以預購（官網） */
export const PREORDER_DAYS = 45;
