import { loadUsers, sourceTitle, type User } from '../data.js';
import type { Source, ToolContext, ToolResult } from '../types.js';

export const MOCK_NOTICE = '本資料含展示假資料或尚未人工核對，實際價格與活動以昇恆昌公告為準。';

export function requireVerifiedUser(ctx: ToolContext): { user: User } | { error: ToolResult } {
  if (!ctx.session.verified || !ctx.session.user_id) return { error: { ok: false, error: 'NEED_VERIFY' } };
  const user = loadUsers().users.find((u) => u.id === ctx.session.user_id);
  if (!user) return { error: { ok: false, error: 'USER_NOT_FOUND' } };
  return { user };
}

export function sourcesFrom(items: { source_id?: string; source_url: string; name?: string }[]): Source[] {
  const seen = new Set<string>();
  const out: Source[] = [];
  for (const it of items) {
    if (!it.source_url || seen.has(it.source_url)) continue;
    seen.add(it.source_url);
    out.push({ title: it.source_id ? sourceTitle(it.source_id, it.name ?? it.source_url) : it.name ?? it.source_url, url: it.source_url });
  }
  return out;
}
