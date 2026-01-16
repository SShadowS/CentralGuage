/**
 * Models listing command
 * @module cli/commands/models
 */

import { Command } from "@cliffy/command";
import {
  MODEL_PRESETS,
  type ModelPreset,
  ModelPresetRegistry,
} from "../../src/llm/model-presets.ts";
import { LLMAdapterRegistry } from "../../src/llm/registry.ts";
import { parseProviderAndModel } from "../helpers/mod.ts";

/** Category display configuration */
const CATEGORY_CONFIG: Array<{
  key: string;
  label: string;
  format: (p: ModelPreset) => string;
}> = [
  {
    key: "flagship",
    label: "Flagship Models",
    format: (p) => `${p.alias.padEnd(12)} -> ${p.displayName} (${p.costTier})`,
  },
  {
    key: "budget",
    label: "Budget Models",
    format: (p) => `${p.alias.padEnd(12)} -> ${p.displayName} (${p.costTier})`,
  },
  {
    key: "coding",
    label: "Coding Models",
    format: (p) =>
      `${p.alias.padEnd(12)} -> ${p.displayName} (${p.category.join(", ")})`,
  },
];

function displayModelsByCategory(
  presetsByCategory: Record<string, ModelPreset[]>,
): void {
  CATEGORY_CONFIG.forEach(({ key, label, format }, index) => {
    const presets = presetsByCategory[key];
    if (presets) {
      console.log(`${index > 0 ? "\n" : ""}   ${label}:`);
      presets.forEach((p) => console.log(`   ${format(p)}`));
    }
  });
}

function displayCostTiers(): void {
  console.log("\nCost Tiers:");
  const costTiers = ModelPresetRegistry.getPresetsByCostTier();
  Object.entries(costTiers).forEach(([tier, presets]) => {
    if (presets.length > 0) {
      const aliases = presets.map((p) => p.alias).join(", ");
      console.log(`   ${tier.padEnd(8)} -> ${aliases}`);
    }
  });
}

function displayProviders(): void {
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
}

function displayProviderModels(provider: string): void {
  const providers = LLMAdapterRegistry.list();

  if (!providers.includes(provider)) {
    console.log(`Unknown provider: ${provider}`);
    console.log(`\nAvailable providers: ${providers.join(", ")}`);
    return;
  }

  const supportedModels = LLMAdapterRegistry.listModelsForProvider(provider);

  console.log(`Models for ${provider} provider:\n`);

  if (supportedModels.length === 0) {
    console.log("   No models found");
    return;
  }

  // Find matching presets for each model
  const modelDetails = supportedModels.map((model) => {
    // Find presets that match this provider and model prefix
    const matchingPreset = Object.values(MODEL_PRESETS).find(
      (p) => p.provider === provider && p.model.startsWith(model),
    );
    return { model, preset: matchingPreset };
  });

  // Display models
  modelDetails.forEach(({ model, preset }) => {
    if (preset) {
      console.log(`   ${model.padEnd(24)} (alias: ${preset.alias})`);
    } else {
      console.log(`   ${model}`);
    }
  });

  // Show aliases for this provider
  const providerPresets = Object.values(MODEL_PRESETS).filter(
    (p) => p.provider === provider,
  );

  if (providerPresets.length > 0) {
    console.log(`\nAliases for ${provider}:`);
    providerPresets.forEach((p) => {
      console.log(`   ${p.alias.padEnd(16)} -> ${p.model}`);
      console.log(`   ${"".padEnd(16)}    ${p.description}`);
    });
  }

  console.log(`\nUsage:`);
  console.log(`   centralgauge bench --llms ${provider}/${supportedModels[0]}`);
  if (providerPresets.length > 0) {
    console.log(
      `   centralgauge bench --llms ${providerPresets[0]?.alias}  (using alias)`,
    );
  }
}

function testModelSpecParsing(testSpecs: string[]): void {
  console.log("\nTesting Model Spec Parsing:");
  testSpecs.forEach((spec) => {
    try {
      const resolved = ModelPresetRegistry.resolve(spec);
      console.log(`   "${spec}" -> resolves to:`);

      resolved.forEach((resolvedSpec) => {
        const { provider, model } = parseProviderAndModel(resolvedSpec);
        console.log(`      ${provider}/${model}`);

        const preset = Object.values(MODEL_PRESETS).find(
          (p) => `${p.provider}/${p.model}` === resolvedSpec,
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

function handleModelsList(testSpecs?: string[]): void {
  console.log("CentralGauge Model Support\n");

  // Model aliases by category
  console.log("Model Aliases (Short Names):");
  displayModelsByCategory(ModelPresetRegistry.getPresetsByCategory());

  // Model groups
  console.log("\nModel Groups:");
  console.log("   flagship     -> Top-tier models for best quality");
  console.log("   budget       -> Cost-effective models for development");
  console.log("   coding       -> Optimized for code generation tasks");
  console.log("   reasoning    -> Advanced reasoning capabilities");
  console.log("   fast         -> Optimized for speed");
  console.log("   quality      -> Optimized for output quality");
  console.log("   comparison   -> Recommended set for model comparison");
  console.log("   all          -> Every available model");

  displayCostTiers();
  displayProviders();

  // Usage examples
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

  if (testSpecs && testSpecs.length > 0) {
    testModelSpecParsing(testSpecs);
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
    .option(
      "-p, --provider <provider:string>",
      "Show all models for a specific provider (e.g., openai, anthropic)",
    )
    .action((options, ...specs: string[]) => {
      if (options.provider) {
        displayProviderModels(options.provider);
      } else {
        handleModelsList(specs.length > 0 ? specs : undefined);
      }
    });
}
