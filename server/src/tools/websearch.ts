import type { SourceEntry } from '../data.js';
import type { Source } from '../types.js';

export type AllowedEntry = { source_id: string; hostname: string; pathname: string; domain_entry: string };

/** 核准的官方網域：昇恆昌官網與財政部關務署（通關規定）；子網域須是真正的子網域 */
export const OFFICIAL_DOMAINS = ['everrich-group.com', 'customs.gov.tw'];
/** 只供追溯、不列入搜尋的合作夥伴網域（例如聯名卡發卡銀行） */
export const PARTNER_DOMAINS = ['taishinbank.com.tw'];
const under = (h: string, d: string) => h === d || h.endsWith('.' + d);
export const isOfficialHost = (h: string) => OFFICIAL_DOMAINS.some((d) => under(h, d));
export const isPartnerHost = (h: string) => PARTNER_DOMAINS.some((d) => under(h, d));
/**
 * 整站搜尋的官方網域（2026-10-15 使用者決定）：昇恆昌官網只要有任一啟用來源，就搜尋整個 everrich-group.com，
 * 不再只限 sources.json 列的路徑；關務署仍只搜列出的路徑。全部停用時一樣回 NO_ENABLED_SOURCES。
 */
export const WHOLE_SITE_DOMAINS = ['everrich-group.com'];
const wholeSiteOf = (h: string) => WHOLE_SITE_DOMAINS.find((d) => under(h, d));

/** 依 data/README.md 規則：只取啟用、HTTPS、無帳密、預設 port、核准官方網域的 hostname＋pathname */
export function buildAllowedDomains(sources: SourceEntry[]): AllowedEntry[] {
  const out: AllowedEntry[] = [];
  const seen = new Set<string>();
  for (const s of sources) {
    if (!s.enabled) continue;
    let u: URL;
    try {
      u = new URL(s.url);
    } catch {
      continue;
    }
    if (u.protocol !== 'https:' || u.username || u.password || u.port) continue;
    const hostname = u.hostname.toLowerCase();
    if (!isOfficialHost(hostname)) continue;
    const entry = hostname + u.pathname;
    if (seen.has(entry)) continue;
    seen.add(entry);
    out.push({ source_id: s.id, hostname, pathname: u.pathname, domain_entry: entry });
  }
  return out;
}

/** 引用必須是同一個 hostname 且 pathname 完全相同，不放寬到同網域其他頁 */
export function isAllowedUrl(url: string, allowed: AllowedEntry[]): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return false;
  const hostname = u.hostname.toLowerCase();
  return allowed.some((a) => a.hostname === hostname && a.pathname === u.pathname);
}

/** 實際送給網頁搜尋的 allowed_domains：整站網域合併成一筆，其他維持 hostname＋pathname */
export function searchDomains(allowed: AllowedEntry[]): string[] {
  const out = new Set<string>();
  for (const a of allowed) out.add(wholeSiteOf(a.hostname) ?? a.domain_entry);
  return [...out];
}

/** 整站模式：整站網域（含真正子網域）的任何 HTTPS 頁面都可引用，前提是該網域至少有一筆啟用來源 */
export function isAllowedSearchUrl(url: string, allowed: AllowedEntry[]): boolean {
  if (isAllowedUrl(url, allowed)) return true;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return false;
  const site = wholeSiteOf(u.hostname.toLowerCase());
  return !!site && allowed.some((a) => wholeSiteOf(a.hostname) === site);
}

export function filterCitations(citations: Source[], allowed: AllowedEntry[], opts: { wholeSite?: boolean } = {}) {
  const ok = opts.wholeSite ? isAllowedSearchUrl : isAllowedUrl;
  const accepted: Source[] = [];
  const rejected: Source[] = [];
  for (const c of citations) (ok(c.url, allowed) ? accepted : rejected).push(c);
  return { accepted, rejected };
}
