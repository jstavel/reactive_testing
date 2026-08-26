import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MODEL_DIR = join(import.meta.dirname ?? ".", "..", "model");
const MODEL_FILES = ["contracts.ts", "fsm.ts", "schemas.ts"].sort();

/**
 * Compute the model version: SHA-256 hex digest of LF-normalized, UTF-8
 * encoded model files in alphabetical filename order.
 */
export function computeModelVersion(): string {
  const hash = createHash("sha256");
  for (const file of MODEL_FILES) {
    const content = readFileSync(join(MODEL_DIR, file), "utf-8").replace(
      /\r\n/g,
      "\n",
    );
    hash.update(content);
  }
  return hash.digest("hex");
}
