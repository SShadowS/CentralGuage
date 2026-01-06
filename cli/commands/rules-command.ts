/**
 * Rules generation command - converts model shortcomings JSON to markdown rules
 * @module cli/commands/rules
 */

import { Command } from "@cliffy/command";
import * as colors from "@std/fmt/colors";
import {
  generateRulesMarkdown,
  getDefaultOutputPath,
  isActionableShortcoming,
  loadShortcomingsFile,
} from "../../src/rules/mod.ts";

/**
 * Handle the rules generation command
 */
async function handleRulesGenerate(
  inputPath: string,
  options: { output?: string | undefined; minOccurrences: number },
): Promise<void> {
  try {
    // Load the shortcomings file
    console.log(colors.dim(`Loading ${inputPath}...`));
    const data = await loadShortcomingsFile(inputPath);

    // Generate the markdown
    const markdown = generateRulesMarkdown(data, {
      minOccurrences: options.minOccurrences,
    });

    // Determine output path
    const outputPath = options.output || getDefaultOutputPath(inputPath);

    // Write the output
    await Deno.writeTextFile(outputPath, markdown);

    // Report success
    const filteredCount = data.shortcomings
      .filter((s) => s.occurrences >= options.minOccurrences)
      .filter(isActionableShortcoming).length;
    const skippedCount = data.shortcomings.length - filteredCount;
    console.log(
      colors.green(`[OK] Generated rules for ${data.model}`),
    );
    console.log(
      colors.dim(
        `     ${filteredCount} actionable rules (${skippedCount} skipped)`,
      ),
    );
    console.log(colors.dim(`     Output: ${outputPath}`));
  } catch (error) {
    console.error(
      colors.red(`[ERROR] ${error instanceof Error ? error.message : error}`),
    );
    Deno.exit(1);
  }
}

/**
 * Register the rules command
 */
export function registerRulesCommand(cli: Command): void {
  cli
    .command(
      "rules <input:string>",
      "Generate markdown rules from shortcomings JSON",
    )
    .description(
      "Convert model shortcomings JSON to a markdown rules file that can help guide code generation",
    )
    .option(
      "-o, --output <path:string>",
      "Output file path (default: {input}.rules.md)",
    )
    .option(
      "--min-occurrences <n:number>",
      "Only include shortcomings with at least N occurrences",
      { default: 1 },
    )
    .example(
      "Basic usage",
      "centralgauge rules model-shortcomings/gpt-5.2-2025-12-11.json",
    )
    .example(
      "Custom output path",
      "centralgauge rules model-shortcomings/gpt-5.2.json -o .claude/rules/gpt-5.2.md",
    )
    .example(
      "Only frequent issues",
      "centralgauge rules model-shortcomings/claude-opus.json --min-occurrences 3",
    )
    .action(async (options, input: string) => {
      await handleRulesGenerate(input, {
        output: options.output,
        minOccurrences: options.minOccurrences,
      });
    });
}
