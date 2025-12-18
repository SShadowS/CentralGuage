/**
 * CLI storage helpers
 * @module cli/helpers/storage
 */

import { openStorage, type StatsStorage } from "../../src/stats/mod.ts";

/**
 * Execute a callback with a storage instance, ensuring proper cleanup.
 * This wraps the common pattern of opening storage, using it, and closing it.
 *
 * @param dbPath - Path to the SQLite database
 * @param callback - Function to execute with the storage instance
 * @returns The result of the callback
 *
 * @example
 * ```ts
 * const result = await withStorage("results/stats.db", async (storage) => {
 *   return await storage.listRuns({ limit: 10 });
 * });
 * ```
 */
export async function withStorage<T>(
  dbPath: string,
  callback: (storage: StatsStorage) => Promise<T>,
): Promise<T> {
  const storage = await openStorage({
    type: "sqlite",
    sqlitePath: dbPath,
  });

  try {
    return await callback(storage);
  } finally {
    await storage.close();
  }
}
