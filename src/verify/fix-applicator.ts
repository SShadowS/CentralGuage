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
export async function applyFix(
  fix: SuggestedFix,
  debug = false,
): Promise<boolean> {
  // Validate file exists
  if (!await exists(fix.filePath)) {
    console.error(
      colors.red(`[ERROR] File not found: ${fix.filePath}`),
    );
    return false;
  }

  // Read current content
  const currentContent = await Deno.readTextFile(fix.filePath);

  if (debug) {
    console.log(colors.gray(`[DEBUG] File path: ${fix.filePath}`));
    console.log(colors.gray(`[DEBUG] File size: ${currentContent.length}`));
    console.log(
      colors.gray(`[DEBUG] codeBefore length: ${fix.codeBefore?.length ?? 0}`),
    );
    console.log(
      colors.gray(`[DEBUG] codeAfter length: ${fix.codeAfter?.length ?? 0}`),
    );
  }

  // Check if the "before" code exists in the file
  if (!fix.codeBefore || !fix.codeAfter) {
    console.error(
      colors.red("[ERROR] Fix does not have codeBefore/codeAfter specified"),
    );
    return false;
  }

  // Check if this is a multi-change format (contains "// ..." separator)
  if (fix.codeBefore.includes("// ...")) {
    if (debug) {
      console.log(colors.gray("[DEBUG] Detected multi-change format"));
    }
    return applyMultiChangeFix(currentContent, fix, debug);
  }

  if (debug) {
    console.log(colors.gray("[DEBUG] codeBefore:"));
    console.log(colors.gray(`  "${fix.codeBefore.replace(/\n/g, "\\n")}"`));
  }

  // Normalize whitespace for comparison
  const normalizedBefore = normalizeWhitespace(fix.codeBefore);
  const normalizedContent = normalizeWhitespace(currentContent);

  // Check if the before code exists
  if (!normalizedContent.includes(normalizedBefore)) {
    if (debug) {
      console.log(
        colors.gray(
          "[DEBUG] Normalized content does not include normalized codeBefore",
        ),
      );
      console.log(
        colors.gray(`[DEBUG] Normalized codeBefore: "${normalizedBefore}"`),
      );
    }
    // Try fuzzy matching
    const fuzzyMatch = findFuzzyMatch(currentContent, fix.codeBefore);
    if (fuzzyMatch) {
      if (debug) {
        console.log(colors.gray("[DEBUG] Found fuzzy match:"));
        console.log(colors.gray(`  "${fuzzyMatch.replace(/\n/g, "\\n")}"`));
      }
      // Apply with fuzzy match - preserve indentation from original
      const newContent = applyWithIndentPreservation(
        currentContent,
        fuzzyMatch,
        fix.codeAfter,
      );
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
 * Apply a fix that contains multiple changes separated by "// ..." markers
 * LLMs often return fixes in this format when multiple similar changes are needed
 */
async function applyMultiChangeFix(
  content: string,
  fix: SuggestedFix,
  debug = false,
): Promise<boolean> {
  // Split both before and after by the "// ..." separator
  const separator = /\n?\s*\/\/\s*\.\.\.\s*\n?/;
  const beforeParts = fix.codeBefore.split(separator).map((s) => s.trim())
    .filter(Boolean);
  const afterParts = fix.codeAfter.split(separator).map((s) => s.trim()).filter(
    Boolean,
  );

  if (debug) {
    console.log(
      colors.gray(`[DEBUG] Found ${beforeParts.length} before parts`),
    );
    console.log(colors.gray(`[DEBUG] Found ${afterParts.length} after parts`));
  }

  if (beforeParts.length !== afterParts.length) {
    console.error(
      colors.red(
        `[ERROR] Mismatched change count: ${beforeParts.length} before vs ${afterParts.length} after`,
      ),
    );
    return false;
  }

  if (beforeParts.length === 0) {
    console.error(
      colors.red("[ERROR] No changes found in multi-change format"),
    );
    return false;
  }

  let currentContent = content;
  let appliedCount = 0;

  for (let i = 0; i < beforeParts.length; i++) {
    const beforePart = beforeParts[i];
    const afterPart = afterParts[i];

    if (!beforePart || !afterPart) continue;

    if (debug) {
      console.log(
        colors.gray(`[DEBUG] Applying change ${i + 1}/${beforeParts.length}:`),
      );
      console.log(colors.gray(`  before: "${beforePart}"`));
      console.log(colors.gray(`  after: "${afterPart}"`));
    }

    // Try fuzzy matching for this part
    const fuzzyMatch = findFuzzyMatch(currentContent, beforePart);
    if (fuzzyMatch) {
      currentContent = applyWithIndentPreservation(
        currentContent,
        fuzzyMatch,
        afterPart,
      );
      appliedCount++;
      if (debug) {
        console.log(colors.gray(`  [OK] Applied change ${i + 1}`));
      }
    } else {
      // Try exact match with the trimmed content
      if (currentContent.includes(beforePart)) {
        currentContent = currentContent.replace(beforePart, afterPart);
        appliedCount++;
        if (debug) {
          console.log(
            colors.gray(`  [OK] Applied change ${i + 1} (exact match)`),
          );
        }
      } else {
        console.log(
          colors.yellow(
            `[WARN] Could not find code for change ${i + 1}: "${
              beforePart.slice(0, 50)
            }..."`,
          ),
        );
      }
    }
  }

  if (appliedCount === 0) {
    console.error(colors.red("[ERROR] No changes could be applied"));
    return false;
  }

  // Write the updated content
  await Deno.writeTextFile(fix.filePath, currentContent);

  if (appliedCount < beforeParts.length) {
    console.log(
      colors.yellow(
        `[WARN] Applied ${appliedCount}/${beforeParts.length} changes`,
      ),
    );
  } else {
    console.log(
      colors.green(`[OK] Applied all ${appliedCount} changes`),
    );
  }

  return true;
}

/**
 * Apply a fix while preserving the indentation from the original matched text
 */
function applyWithIndentPreservation(
  content: string,
  matchedText: string,
  replacement: string,
): string {
  // Extract the indentation from the first line of matched text
  const matchedLines = matchedText.split("\n");
  const firstLine = matchedLines[0] || "";
  const indentMatch = firstLine.match(/^(\s*)/);
  const indent = indentMatch ? indentMatch[1] : "";

  // Apply indentation to replacement lines
  const replacementLines = replacement.split("\n");
  const indentedReplacement = replacementLines.map((line, idx) => {
    // First line already positioned, subsequent lines need indent
    if (idx === 0) return indent + line.trim();
    return line.trim() ? indent + line.trim() : line;
  }).join("\n");

  return content.replace(matchedText, indentedReplacement);
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
