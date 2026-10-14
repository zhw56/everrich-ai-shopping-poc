import type { KbEntry, SourceEntry } from './data.js';

export type Source = { title: string; url: string; cited_text?: string };

export type ToolResult = {
  ok: boolean;
  data?: unknown;
  sources?: Source[];
  error?: string;
};

export type Session = {
  id: string;
  verified: boolean;
  user_id: string | null;
  otp_attempts: number;
  locked_until: number | null;
  prefs: Record<string, unknown>;
};

/** 測試與評測用的隔離覆寫，不會修改 data/ 內的正式資料 */
export type ToolFixtures = {
  sources?: SourceEntry[];
  /** 覆寫知識庫內容；空陣列代表知識庫查不到（評測 kb_empty） */
  kb?: KbEntry[];
};

export type ToolContext = { session: Session; fixtures?: ToolFixtures };

export type ToolDefinition = {
  name: string;
  description: string;
  input_schema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
};

export type Tool<I = any> = {
  definition: ToolDefinition;
  run: (input: I, ctx: ToolContext) => Promise<ToolResult>;
};

export function createSession(id: string): Session {
  return { id, verified: false, user_id: null, otp_attempts: 0, locked_until: null, prefs: {} };
}
