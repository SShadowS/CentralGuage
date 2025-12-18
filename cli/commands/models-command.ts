/**
 * Models listing command
 * @module cli/commands/models
 */

import { Command } from "@cliffy/command";
import {
  MODEL_PRESETS,
  ModelPresetRegistry,
} from "../../src/llm/model-presets.ts";
import { LLMAdapterRegistry } from "../../src/llm/registry.ts";
import { parseProviderAndModel } from "../helpers/mod.ts";

function handleModelsList(testSpecs?: string[]): void {
  console.log("CentralGauge Model Support\n");

  // Show model presets (aliases)
  console.log("Model Aliases (Short Names):");
  const presetsByCategory = ModelPresetRegistry.getPresetsByCategory();

  // Show flagship models first
  if (presetsByCategory["flagship"]) {
    console.log("   Flagship Models:");
    presetsByCategory["flagship"].forEach((preset) => {
      console.log(
        `   ${
          preset.alias.padEnd(12)
        } -> ${preset.displayName} (${preset.costTier})`,
      );
    });
  }

  // Show budget models
  if (presetsByCategory["budget"]) {
    console.log("\n   Budget Models:");
    presetsByCategory["budget"].forEach((preset) => {
      console.log(
        `   ${
          preset.alias.padEnd(12)
        } -> ${preset.displayName} (${preset.costTier})`,
      );
    });
  }

  // Show coding-specific models
  if (presetsByCategory["coding"]) {
    console.log("\n   Coding Models:");
    presetsByCategory["coding"].forEach((preset) => {
      console.log(
        `   ${preset.alias.padEnd(12)} -> ${preset.displayName} (${
          preset.category.join(", ")
        })`,
      );
    });
  }

  // Show model groups
  console.log("\nModel Groups:");
  console.log("   flagship     -> Top-tier models for best quality");
  console.log("   budget       -> Cost-effective models for development");
  console.log("   coding       -> Optimized for code generation tasks");
  console.log("   reasoning    -> Advanced reasoning capabilities");
  console.log("   fast         -> Optimized for speed");
  console.log("   quality      -> Optimized for output quality");
  console.log("   comparison   -> Recommended set for model comparison");
  console.log("   all          -> Every available model");

  // Show cost tiers
  console.log("\nCost Tiers:");
  const costTiers = ModelPresetRegistry.getPresetsByCostTier();
  Object.entries(costTiers).forEach(([tier, presets]) => {
    if (presets.length > 0) {
      const aliases = presets.map((p) => p.alias).join(", ");
      console.log(`   ${tier.padEnd(8)} -> ${aliases}`);
    }
  });

  // Show providers for reference
  console.log("\nAvailable Providers:");
  const providers = LLMAdapterRegistry.list();
  providers.forEach((provider) => {
    const supportedModels = LLMAdapterRegistry.getSupportedModels(provider);
    console.log(
      `   ${provider}: ${supportedModels.slice(0, 3).join(", ")}${
        supportedModels.length > 3 ? "..." : ""
      }`,
    );
  });

  // Show usage examples
  console.log("\nUsage Examples:");
  console.log("   # Use aliases (recommended)");
  console.log("   centralgauge bench --llms sonnet,gpt-4o");
  console.log("   \n   # Use groups for comparisons");
  console.log("   centralgauge bench --llms flagship");
  console.log("   \n   # Mix aliases and groups");
  console.log("   centralgauge bench --llms flagship,budget");
  console.log("   \n   # Traditional provider/model format still works");
  console.log(
    "   centralgauge bench --llms openai/gpt-4o,anthropic/claude-3-5-sonnet-20241022",
  );

  // Test parsing if specs provided
  if (testSpecs && testSpecs.length > 0) {
    console.log("\nTesting Model Spec Parsing:");
    testSpecs.forEach((spec) => {
      try {
        const resolved = ModelPresetRegistry.resolve(spec);
        console.log(`   "${spec}" -> resolves to:`);

        resolved.forEach((resolvedSpec) => {
          const { provider, model } = parseProviderAndModel(resolvedSpec);
          console.log(`      ${provider}/${model}`);

          // Check if it's a known preset
          const preset = Object.values(MODEL_PRESETS).find((p) =>
            `${p.provider}/${p.model}` === resolvedSpec
          );
          if (preset) {
            console.log(
              `        (${preset.displayName} - ${preset.description})`,
            );
          }
        });
      } catch (error) {
        console.log(
          `   "${spec}" -> [ERROR] ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    });
  }

  console.log("\nPro Tips:");
  console.log(
    "   - Use aliases like 'sonnet' instead of 'anthropic/claude-3-5-sonnet-20241022'",
  );
  console.log(
    "   - Use groups like 'flagship' to test multiple top-tier models",
  );
  console.log("   - Mix aliases, groups, and provider/model formats freely");
  console.log("   - Set ANTHROPIC_API_KEY, OPENAI_API_KEY etc. for API access");
}

export function registerModelsCommand(cli: Command): void {
  cli.command("models [...specs]", "List supported models and test parsing")
    .action((_options, ...specs: string[]) => {
      handleModelsList(specs.length > 0 ? specs : undefined);
    });
}
