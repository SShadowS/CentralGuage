/**
 * Fix applicator for the verify command
 * Applies suggested fixes to task YAML and test AL files
 */

import { exists } from "@std/fs";
import * as colors from "@std/fmt/colors";
import type { SuggestedFix } from "./types.ts";

/**
 * Generate a unified diff preview for a suggested fix
 */
export function generateDiffPreview(fix: SuggestedFix): string {
  if (!fix.codeBefore || !fix.codeAfter) {
    return colors.gray("(No diff available - manual review required)");
  }

  const lines: string[] = [];
  lines.push(colors.bold(`--- ${fix.filePath}`));
  lines.push(colors.bold(`+++ ${fix.filePath} (modified)`));

  // Split into lines for diff
  const beforeLines = fix.codeBefore.split("\n");
  const afterLines = fix.codeAfter.split("\n");

  // Simple line-by-line diff
  const maxLines = Math.max(beforeLines.length, afterLines.length);

  for (let i = 0; i < maxLines; i++) {
    const before = beforeLines[i];
    const after = afterLines[i];

    if (before === after) {
      lines.push(colors.gray(`  ${before || ""}`));
    } else {
      if (before !== undefined) {
        lines.push(colors.red(`- ${before}`));
      }
      if (after !== undefined) {
        lines.push(colors.green(`+ ${after}`));
      }
    }
  }

  return lines.join("\n");
}

/**
 * Apply a suggested fix to a file
 * Uses string replacement to apply the fix
 */
export async function applyFix(fix: SuggestedFix): Promise<boolean> {
  // Validate file exists
  if (!await exists(fix.filePath)) {
    console.error(
      colors.red(`[ERROR] File not found: ${fix.filePath}`),
    );
    return false;
  }

  // Read current content
  const currentContent = await Deno.readTextFile(fix.filePath);

  // Check if the "before" code exists in the file
  if (!fix.codeBefore || !fix.codeAfter) {
    console.error(
      colors.red("[ERROR] Fix does not have codeBefore/codeAfter specified"),
    );
    return false;
  }

  // Normalize whitespace for comparison
  const normalizedBefore = normalizeWhitespace(fix.codeBefore);
  const normalizedContent = normalizeWhitespace(currentContent);

  // Check if the before code exists
  if (!normalizedContent.includes(normalizedBefore)) {
    // Try fuzzy matching
    const fuzzyMatch = findFuzzyMatch(currentContent, fix.codeBefore);
    if (fuzzyMatch) {
      // Apply with fuzzy match
      const newContent = currentContent.replace(fuzzyMatch, fix.codeAfter);
      await Deno.writeTextFile(fix.filePath, newContent);
      console.log(
        colors.yellow("[WARN] Applied fix with fuzzy matching"),
      );
      return true;
    }

    console.error(
      colors.red("[ERROR] Could not find the code to replace in file"),
    );
    console.error(colors.gray("Expected to find:"));
    console.error(colors.gray(fix.codeBefore.slice(0, 200)));
    return false;
  }

  // Apply the fix using exact string replacement
  const newContent = currentContent.replace(fix.codeBefore, fix.codeAfter);

  // Verify the replacement was made
  if (newContent === currentContent) {
    console.error(
      colors.red("[ERROR] Replacement did not change the file"),
    );
    return false;
  }

  // Write the new content
  await Deno.writeTextFile(fix.filePath, newContent);

  return true;
}

/**
 * Normalize whitespace for comparison
 * Trims lines and collapses multiple spaces
 */
function normalizeWhitespace(text: string): string {
  return text
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Find a fuzzy match for the before code in the file content
 * Handles minor whitespace differences
 */
function findFuzzyMatch(content: string, before: string): string | null {
  // Try with normalized line endings
  const beforeNormalized = before.replace(/\r\n/g, "\n").trim();

  // Split into lines
  const beforeLines = beforeNormalized.split("\n").map((l) => l.trim());
  const contentLines = content.split("\n");

  // Find the starting line
  for (let i = 0; i < contentLines.length; i++) {
    const currentLine = contentLines[i];
    const firstBeforeLine = beforeLines[0];
    if (!currentLine || !firstBeforeLine) continue;

    if (currentLine.trim() === firstBeforeLine) {
      // Check if subsequent lines match
      let matches = true;
      const matchedLines: string[] = [];

      for (
        let j = 0;
        j < beforeLines.length && i + j < contentLines.length;
        j++
      ) {
        const contentLine = contentLines[i + j];
        const beforeLine = beforeLines[j];
        if (!contentLine || !beforeLine) {
          matches = false;
          break;
        }

        if (contentLine.trim() === beforeLine) {
          matchedLines.push(contentLine);
        } else {
          matches = false;
          break;
        }
      }

      if (matches && matchedLines.length === beforeLines.length) {
        return matchedLines.join("\n");
      }
    }
  }

  return null;
}

/**
 * Validate a fix before applying
 */
export async function validateFix(fix: SuggestedFix): Promise<{
  valid: boolean;
  errors: string[];
  warnings: string[];
}> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check file exists
  if (!await exists(fix.filePath)) {
    errors.push(`File not found: ${fix.filePath}`);
    return { valid: false, errors, warnings };
  }

  // Check fix has necessary parts
  if (!fix.codeBefore) {
    errors.push("Fix is missing codeBefore");
  }
  if (!fix.codeAfter) {
    errors.push("Fix is missing codeAfter");
  }

  // Check codeBefore exists in file
  if (fix.codeBefore) {
    const content = await Deno.readTextFile(fix.filePath);
    if (!content.includes(fix.codeBefore)) {
      const fuzzyMatch = findFuzzyMatch(content, fix.codeBefore);
      if (fuzzyMatch) {
        warnings.push(
          "Exact match not found, but fuzzy match available - will use fuzzy matching",
        );
      } else {
        errors.push("codeBefore not found in file (even with fuzzy matching)");
      }
    }
  }

  // Warn if fix is very large
  if (fix.codeAfter && fix.codeAfter.length > 1000) {
    warnings.push("Fix is quite large - please review carefully");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Create a backup of a file before applying fixes
 */
export async function createBackup(filePath: string): Promise<string | null> {
  if (!await exists(filePath)) {
    return null;
  }

  const backupPath = `${filePath}.bak.${Date.now()}`;
  await Deno.copyFile(filePath, backupPath);
  return backupPath;
}

/**
 * Restore a file from backup
 */
export async function restoreBackup(
  originalPath: string,
  backupPath: string,
): Promise<boolean> {
  if (!await exists(backupPath)) {
    return false;
  }

  await Deno.copyFile(backupPath, originalPath);
  await Deno.remove(backupPath);
  return true;
}
