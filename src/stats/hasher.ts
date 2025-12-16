/**
 * Config hash generation for identifying comparable benchmark runs
 *
 * The config hash uniquely identifies a benchmark configuration, allowing:
 * - Grouping runs with identical configs for trend analysis
 * - Detecting when configs change
 * - Comparing apples-to-apples across runs
 */

import type { ConfigHashInput } from "./types.ts";

/**
 * Generate SHA-256 hash of input data
 */
async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Generate a deterministic config hash from benchmark configuration
 *
 * The hash includes:
 * - Task manifests (IDs and content hashes)
 * - Model variants and their configurations
 * - Execution parameters (attempt limit, defaults)
 *
 * @param input The config hash input
 * @returns SHA-256 hash (64 hex characters)
 */
export async function generateConfigHash(
  input: ConfigHashInput,
): Promise<string> {
  // Sort for determinism
  const normalized = {
    tasks: [...input.taskManifests]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((t) => ({ id: t.id, hash: t.contentHash })),
    variants: [...input.variants]
      .sort((a, b) => a.variantId.localeCompare(b.variantId))
      .map((v) => ({
        id: v.variantId,
        config: sortObjectKeys(v.config as unknown as Record<string, unknown>),
      })),
    execution: {
      attemptLimit: input.execution.attemptLimit,
      temperature: input.execution.defaultTemperature,
      maxTokens: input.execution.defaultMaxTokens,
    },
  };

  const serialized = JSON.stringify(normalized);
  return await sha256(serialized);
}

/**
 * Generate a task set hash from task manifests only
 *
 * This is useful for grouping runs that tested the same tasks,
 * regardless of which models were used.
 *
 * @param tasks Array of task IDs and their content hashes
 * @returns SHA-256 hash (first 16 hex characters for brevity)
 */
export async function generateTaskSetHash(
  tasks: Array<{ id: string; contentHash: string }>,
): Promise<string> {
  const sorted = [...tasks]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((t) => ({ id: t.id, hash: t.contentHash }));

  const serialized = JSON.stringify(sorted);
  const fullHash = await sha256(serialized);
  // Return shorter hash for readability (still unique enough)
  return fullHash.slice(0, 16);
}

/**
 * Generate a content hash for a task manifest
 *
 * @param manifestContent The YAML content of the manifest
 * @returns SHA-256 hash (first 16 hex characters)
 */
export async function generateManifestHash(
  manifestContent: string,
): Promise<string> {
  // Normalize whitespace but preserve meaningful content
  const normalized = manifestContent.trim();
  const fullHash = await sha256(normalized);
  return fullHash.slice(0, 16);
}

/**
 * Sort object keys recursively for deterministic serialization
 */
function sortObjectKeys<T extends Record<string, unknown>>(
  obj: T,
): Record<string, unknown> {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) =>
      typeof item === "object" && item !== null
        ? sortObjectKeys(item as Record<string, unknown>)
        : item
    ) as unknown as Record<string, unknown>;
  }

  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    const value = obj[key];
    sorted[key] = typeof value === "object" && value !== null
      ? sortObjectKeys(value as Record<string, unknown>)
      : value;
  }
  return sorted;
}

/**
 * Generate a short hash suitable for display
 *
 * @param fullHash The full SHA-256 hash
 * @param length Number of characters (default 8)
 * @returns Shortened hash
 */
export function shortenHash(fullHash: string, length = 8): string {
  return fullHash.slice(0, length);
}
