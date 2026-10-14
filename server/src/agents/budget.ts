import type { AgentName } from './specs.js';

/** 一輪對話內專員共用的工具額度；每次 take 都計入主控的 6 次上限 */
export class ToolBudget {
  private used = new Map<AgentName, number>();
  private released = new Set<AgentName>();
  private pool = 0;
  readonly log: { agent: AgentName; tool: string }[] = [];

  constructor(private quotas: Map<AgentName, number>) {}

  remaining(agent: AgentName): number {
    return Math.max(0, (this.quotas.get(agent) ?? 0) - (this.used.get(agent) ?? 0)) + this.pool;
  }

  take(agent: AgentName, tool: string): boolean {
    const used = this.used.get(agent) ?? 0;
    if (used < (this.quotas.get(agent) ?? 0)) {
      this.used.set(agent, used + 1);
    } else if (this.pool > 0) {
      this.pool--;
      this.used.set(agent, used + 1);
    } else {
      return false;
    }
    this.log.push({ agent, tool });
    return true;
  }

  /** 專員結束後把沒用完的額度讓給仍在執行的專員 */
  release(agent: AgentName) {
    if (this.released.has(agent)) return;
    this.released.add(agent);
    this.pool += Math.max(0, (this.quotas.get(agent) ?? 0) - (this.used.get(agent) ?? 0));
  }

  get total(): number {
    return this.log.length;
  }
}
