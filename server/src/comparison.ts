import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os';
import type { summarizeProduct, summarizePromo } from './engine/index.js';
import type { BundleCost } from './engine/bundles.js';
import type { Source } from './types.js';

export type ComparisonRow =
  | ({ type: 'promo' } & ReturnType<typeof summarizePromo>)
  | ({ type: 'product' } & ReturnType<typeof summarizeProduct>)
  | ({ type: 'bundle' } & BundleCost);
export type Comparison = {
  id: string;
  title: string;
  created_at: string;
  rows: ComparisonRow[];
  sources: Source[];
  notice: string;
};

export function isPrivateIPv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => !Number.isInteger(p) || p < 0 || p > 255)) return false;
  return parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168);
}

/** Never encode localhost into a QR intended for another device. No request Host is trusted. */
export function shareBaseUrl(
  configured = process.env.SHARE_BASE_URL,
  interfaces: Record<string, NetworkInterfaceInfo[] | undefined> = networkInterfaces(),
): string | null {
  if (configured) {
    try {
      const url = new URL(configured);
      const local = isPrivateIPv4(url.hostname);
      if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) || url.username || url.password ||
        url.search || url.hash || url.pathname !== '/' || url.hostname === 'localhost' ||
        url.hostname.endsWith('.localhost') || url.hostname === '0.0.0.0' || url.hostname.startsWith('127.') || url.hostname === '[::1]') return null;
      return url.origin;
    } catch { return null; }
  }
  // 雲端部署時容器的內網 IP 對手機沒有意義，必須明確設定 SHARE_BASE_URL（部署後的 https 網址）
  if (process.env.PUBLIC_MODE === '1') return null;
  const names = Object.keys(interfaces)
    .filter(name => !/^(lo|utun|tun|tap|docker|veth|bridge|vmnet|vbox)/i.test(name))
    .sort((a, b) => Number(!/^(en|eth|wlan|wi-?fi)/i.test(a)) - Number(!/^(en|eth|wlan|wi-?fi)/i.test(b)) || a.localeCompare(b));
  for (const name of names) {
    const address = interfaces[name]?.find(info => !info.internal && info.family === 'IPv4' && isPrivateIPv4(info.address));
    if (address) return `http://${address.address}:5173`;
  }
  return null;
}
