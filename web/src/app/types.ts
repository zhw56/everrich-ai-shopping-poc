export type Source = { title: string; url: string; cited_text?: string };
export type Card = {
  id?: string; name?: string; brand?: string; category?: string; price?: number; size_label?: string;
  label?: string; condition_label?: string; channel_label?: string; requirement_label?: string; valid_to?: string | null;
  saving?: number; rebate?: number; points?: number; gap?: number; pay_amount?: number;
  reason?: string; source_url?: string; mock?: boolean; verified?: boolean; tags?: string[];
  bundle_id?: string; list_price?: number; bundle_price?: number; total_cost?: number; gift?: string | null;
  product?: { name?: string; brand?: string }; promo?: Card;
  order_no?: string; status?: string; pickup_label?: string; total?: number; subtotal?: number; discount_total?: number;
  items?: { name: string; amount: number }[];
  promo_check?: { name: string; reached: boolean; gap: number; eligible_amount: number }[];
};
export type CardSet = { type: 'promo' | 'product' | 'bundle' | 'order'; items: Card[] };
export type Action = { type: 'verify' | 'quick_replies' | 'compare' | 'handoff'; payload: { reason?: string; question?: string; options?: string[]; url?: string; id?: string; ticket_id?: string; notice?: string; message?: string } };
export type ChatEvent = { event: string; data: unknown };
export type Message = { id: string; role: 'user' | 'assistant'; text: string; cards: CardSet[]; sources: Source[]; actions: Action[]; error?: string };
export function safeUrl(value?: string, relative = false): string | undefined {
  if (!value) return undefined;
  if (relative && /^\/compare\/[a-zA-Z0-9_-]+$/.test(value)) return value;
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : undefined; } catch { return undefined; }
}

// getRandomValues also works on a phone visiting the LAN preview over HTTP.
export function createId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
}
