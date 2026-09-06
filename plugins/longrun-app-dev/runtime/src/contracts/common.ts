export type IsoDateTime = string;
export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { readonly [key: string]: JsonValue };

export interface CommandResult {
  readonly command: string;
  readonly durationMs: number;
  readonly exitCode: number | null;
  readonly status: "passed" | "failed" | "skipped";
  readonly summary?: string;
}

export interface ArtifactReference {
  readonly kind: string;
  readonly path: string;
  readonly sha256?: string;
}
