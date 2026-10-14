import type { Tool, ToolContext, ToolResult } from '../types.js';
import { generateComparison } from './generate_comparison.js';
import { getOrder } from './get_order.js';
import { getPromoPrice } from './get_promo_price.js';
import { getPurchases } from './get_purchases.js';
import { getUserProfile } from './get_user_profile.js';
import { handoffToHuman } from './handoff_to_human.js';
import { queryProducts } from './query_products.js';
import { queryPromos } from './query_promos.js';
import { recommendProductsTool } from './recommend_products.js';
import { recommendPromosTool } from './recommend_promos.js';
import { searchOfficialWeb } from './search_official_web.js';
import { searchKb } from './search_kb.js';
import { verifyIdentity } from './verify_identity.js';

export const tools: Tool[] = [
  verifyIdentity,
  getUserProfile,
  getPurchases,
  getOrder,
  queryPromos,
  recommendPromosTool,
  queryProducts,
  recommendProductsTool,
  getPromoPrice,
  searchKb,
  searchOfficialWeb,
  generateComparison,
  handoffToHuman,
];

export const toolMap = new Map(tools.map((t) => [t.definition.name, t]));

/** 取得指定名稱的工具定義，供主控與專員 agent 限定可用工具 */
export function definitionsFor(names?: string[]) {
  return (names ? tools.filter((t) => names.includes(t.definition.name)) : tools).map((t) => t.definition);
}

export async function runTool(name: string, input: unknown, ctx: ToolContext): Promise<ToolResult> {
  const tool = toolMap.get(name);
  if (!tool) return { ok: false, error: 'UNKNOWN_TOOL' };
  try {
    return await tool.run(input ?? {}, ctx);
  } catch (e) {
    return { ok: false, error: `TOOL_ERROR: ${(e as Error).message}` };
  }
}
