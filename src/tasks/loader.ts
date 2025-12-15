import { exists } from "@std/fs";
import { parse } from "@std/yaml";
import type { TaskManifest } from "./interfaces.ts";

/**
 * Load a task manifest from a YAML file
 */
export async function loadTaskManifest(
  manifestPath: string,
): Promise<TaskManifest> {
  if (!await exists(manifestPath)) {
    throw new Error(`Task manifest not found: ${manifestPath}`);
  }

  const content = await Deno.readTextFile(manifestPath);
  const manifest = parse(content) as TaskManifest;

  return manifest;
}
