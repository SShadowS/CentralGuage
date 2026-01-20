/**
 * Models listing command
 * @module cli/commands/models
 */

import * as colors from "@std/fmt/colors";
import { Command } from "@cliffy/command";
import {
  MODEL_PRESETS,
  type ModelPreset,
  ModelPresetRegistry,
} from "../../src/llm/model-presets.ts";
import { LLMAdapterRegistry } from "../../src/llm/registry.ts";
import type { CacheStats, DiscoveryResult } from "../../src/llm/mod.ts";
import { EnvLoader } from "../../src/utils/env-loader.ts";
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
    console.log(`   ${provider}`);
  });
  console.log(colors.dim("\n   Use --provider <name> --live to list models"));
}

function displayProviderModelsNotice(provider: string): void {
  const providers = LLMAdapterRegistry.list();

  if (!providers.includes(provider)) {
    console.log(`Unknown provider: ${provider}`);
    console.log(`\nAvailable providers: ${providers.join(", ")}`);
    return;
  }

  console.log(`Models for ${provider} provider:\n`);
  console.log(
    colors.yellow(
      "   Model lists are now fetched from provider APIs.\n" +
        "   Use --live to fetch live models:\n",
    ),
  );
  console.log(`   centralgauge models --provider ${provider} --live\n`);

  // Show aliases for this provider (these are known statically)
  const providerPresets = Object.values(MODEL_PRESETS).filter(
    (p) => p.provider === provider,
  );

  if (providerPresets.length > 0) {
    console.log(`Known aliases for ${provider}:`);
    providerPresets.forEach((p) => {
      console.log(`   ${p.alias.padEnd(16)} -> ${p.model}`);
      console.log(`   ${"".padEnd(16)}    ${p.description}`);
    });
  }

  console.log(`\nUsage:`);
  console.log(
    `   centralgauge bench --llms ${provider}/<model-id>  (use --live to see available models)`,
  );
  if (providerPresets.length > 0) {
    console.log(
      `   centralgauge bench --llms ${
        providerPresets[0]?.alias
      }  (using alias)`,
    );
  }
}

/**
 * Display provider models with dynamic discovery
 */
async function displayProviderModelsLive(
  provider: string,
  forceRefresh: boolean,
): Promise<void> {
  const providers = LLMAdapterRegistry.list();

  if (!providers.includes(provider)) {
    console.log(`Unknown provider: ${provider}`);
    console.log(`\nAvailable providers: ${providers.join(", ")}`);
    return;
  }

  console.log(
    `${colors.cyan("[Discovering]")} Models for ${provider} provider...\n`,
  );

  // Load environment to get API keys
  await EnvLoader.loadEnvironment();

  // Get appropriate API key from environment
  const apiKeyEnvMap: Record<string, string> = {
    openai: "OPENAI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    gemini: "GOOGLE_API_KEY",
    "azure-openai": "AZURE_OPENAI_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
  };

  const envKey = apiKeyEnvMap[provider];
  const apiKey = envKey ? Deno.env.get(envKey) : undefined;

  const result = await LLMAdapterRegistry.discoverModels(
    provider,
    apiKey ? { provider, model: "", apiKey } : undefined,
    { forceRefresh, skipCache: forceRefresh },
  );

  displayDiscoveryResult(provider, result);
}

/**
 * Display discovery result
 */
function displayDiscoveryResult(
  provider: string,
  result: DiscoveryResult,
): void {
  const sourceLabel = result.source === "api"
    ? colors.green("[API]")
    : colors.yellow("[Cache]");

  console.log(`Models for ${provider} provider ${sourceLabel}:\n`);

  if (result.models.length === 0) {
    console.log("   No models found");
    if (result.error) {
      console.log(colors.red(`   Error: ${result.error}`));
    }
    return;
  }

  // Display models
  result.discoveredModels.forEach((model) => {
    const name = model.name && model.name !== model.id
      ? ` (${model.name})`
      : "";
    console.log(`   ${model.id}${colors.dim(name)}`);
  });

  console.log(
    `\n${
      colors.dim(
        `Total: ${result.models.length} models (source: ${result.source})`,
      )
    }`,
  );

  if (result.fetchedAt) {
    const fetchedDate = new Date(result.fetchedAt);
    console.log(colors.dim(`Fetched: ${fetchedDate.toLocaleString()}`));
  }

  // Show aliases for this provider
  const providerPresets = Object.values(MODEL_PRESETS).filter(
    (p) => p.provider === provider,
  );

  if (providerPresets.length > 0) {
    console.log(`\nAliases for ${provider}:`);
    providerPresets.forEach((p) => {
      console.log(`   ${p.alias.padEnd(16)} -> ${p.model}`);
    });
  }

  console.log(`\nUsage:`);
  console.log(`   centralgauge bench --llms ${provider}/${result.models[0]}`);
}

/**
 * Display cache statistics
 */
function displayCacheStats(stats: CacheStats): void {
  console.log("Model Discovery Cache Statistics\n");

  console.log(`Total providers cached: ${stats.totalProviders}`);
  console.log(`  Valid: ${colors.green(String(stats.validCacheCount))}`);
  console.log(`  Expired: ${colors.yellow(String(stats.expiredCacheCount))}`);

  if (Object.keys(stats.providers).length > 0) {
    console.log("\nPer-provider details:");

    for (const [provider, info] of Object.entries(stats.providers)) {
      const statusIcon = info.valid
        ? colors.green("[Valid]")
        : colors.yellow("[Expired]");
      const sourceLabel = info.source === "api"
        ? colors.green("API")
        : colors.dim("Static");

      console.log(`\n  ${provider}:`);
      console.log(`    Status: ${statusIcon}`);
      console.log(`    Source: ${sourceLabel}`);
      console.log(`    Models: ${info.modelCount}`);

      if (info.fetchedAt) {
        const fetchedDate = new Date(info.fetchedAt);
        console.log(`    Fetched: ${fetchedDate.toLocaleString()}`);
      }

      if (info.ttlMs !== undefined) {
        const ttlHours = (info.ttlMs / (1000 * 60 * 60)).toFixed(1);
        const ttlLabel = info.ttlMs > 0
          ? colors.dim(`${ttlHours}h remaining`)
          : colors.yellow("expired");
        console.log(`    TTL: ${ttlLabel}`);
      }
    }
  } else {
    console.log(
      colors.dim(
        "\nNo cached providers. Use --provider with --live to populate cache.",
      ),
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

  console.log("\nDynamic Discovery:");
  console.log("   # Discover live models from provider APIs");
  console.log("   centralgauge models --provider openrouter --live");
  console.log("   \n   # Force refresh cached models");
  console.log("   centralgauge models --provider openai --refresh");
  console.log("   \n   # View cache statistics");
  console.log("   centralgauge models --cache-stats");

  console.log("\nPro Tips:");
  console.log(
    "   - Use aliases like 'sonnet' instead of 'anthropic/claude-3-5-sonnet-20241022'",
  );
  console.log(
    "   - Use groups like 'flagship' to test multiple top-tier models",
  );
  console.log("   - Mix aliases, groups, and provider/model formats freely");
  console.log("   - Set ANTHROPIC_API_KEY, OPENAI_API_KEY etc. for API access");
  console.log(
    "   - Use --live to discover all available models from provider APIs",
  );
}

export function registerModelsCommand(cli: Command): void {
  cli.command("models [...specs]", "List supported models and test parsing")
    .option(
      "-p, --provider <provider:string>",
      "Show all models for a specific provider (e.g., openai, anthropic)",
    )
    .option(
      "--refresh",
      "Force refresh from provider API, ignoring cache",
    )
    .option(
      "--live",
      "Fetch live models from provider API (uses cache if available, unless --refresh)",
    )
    .option(
      "--cache-stats",
      "Display model discovery cache statistics",
    )
    .action(async (options, ...specs: string[]) => {
      // Handle cache stats
      if (options.cacheStats) {
        const stats = LLMAdapterRegistry.getModelCacheStats();
        displayCacheStats(stats);
        return;
      }

      // Handle provider-specific listing
      if (options.provider) {
        if (options.live || options.refresh) {
          await displayProviderModelsLive(
            options.provider,
            options.refresh ?? false,
          );
        } else {
          displayProviderModelsNotice(options.provider);
        }
        return;
      }

      // Default: show all models
      handleModelsList(specs.length > 0 ? specs : undefined);
    });
}
