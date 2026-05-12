import type { SupportedKind } from "../types.mts";

export type SourcePayload = {
  baselineContent: string;
  content: string;
  id: string;
  kind: SupportedKind;
  mtimeMs: number;
  name: string;
  relativePath: string;
  title: string;
};
