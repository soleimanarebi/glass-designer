import type { EngineResult, GlassInput } from "@glass/engine";

export interface ReportOptions {
  snapshot?: string;
  snapshotAspect?: number;
  disclaimer: string;
  title?: string;
  date?: Date;
}

export function exportReport(_input: GlassInput, _result: EngineResult, _opts: ReportOptions): void {
  throw new Error("The PDF report arrives in the next phase.");
}
