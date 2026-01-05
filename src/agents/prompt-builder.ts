/**
 * Universal prompt builder for AI agents.
 *
 * Renders the universal-agent.md template with context-specific values
 * and supports Handlebars-style conditionals for adaptive workflows.
 */

import { dirname, fromFileUrl, join } from "@std/path";
import { ResourceNotFoundError } from "../errors.ts";

/**
 * Context for rendering the universal prompt template.
 */
export interface PromptContext {
  /** Task ID (e.g., "CG-AL-E001") */
  taskId: string;

  /** Task description from YAML */
  taskDescription: string;

  /** Absolute path to workspace directory */
  workspacePath: string;

  /** Whether the task requires tests (has testApp in expected) */
  requiresTests: boolean;

  /** Optional app GUID (generated if not provided) */
  appGuid?: string;
}

/**
 * Generate a random UUID v4.
 */
function generateGuid(): string {
  return crypto.randomUUID();
}

/**
 * Simple template engine that supports:
 * - Variable substitution: {{VARIABLE}}
 * - Conditional blocks: {{#if CONDITION}}...{{/if}}
 * - Negated conditionals: {{#unless CONDITION}}...{{/unless}}
 *
 * This is a minimal implementation that doesn't require external dependencies.
 */
function renderTemplate(
  template: string,
  variables: Record<string, string | boolean>,
): string {
  let result = template;

  // Process {{#if VAR}}...{{/if}} blocks
  result = result.replace(
    /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_, varName, content) => {
      const value = variables[varName];
      return value ? content : "";
    },
  );

  // Process {{#unless VAR}}...{{/unless}} blocks
  result = result.replace(
    /\{\{#unless\s+(\w+)\}\}([\s\S]*?)\{\{\/unless\}\}/g,
    (_, varName, content) => {
      const value = variables[varName];
      return !value ? content : "";
    },
  );

  // Process {{VARIABLE}} substitutions
  result = result.replace(/\{\{(\w+)\}\}/g, (_, varName) => {
    const value = variables[varName];
    if (value === undefined) {
      return `{{${varName}}}`; // Keep unresolved variables
    }
    return String(value);
  });

  return result;
}

/**
 * Load the universal agent template from disk.
 */
async function loadTemplate(): Promise<string> {
  // Try multiple paths to find the template
  const possiblePaths = [
    // From project root (normal execution)
    join(Deno.cwd(), "templates", "universal-agent.md"),
    // From src/agents/ directory
    join(
      dirname(fromFileUrl(import.meta.url)),
      "..",
      "..",
      "templates",
      "universal-agent.md",
    ),
  ];

  for (const path of possiblePaths) {
    try {
      return await Deno.readTextFile(path);
    } catch {
      // Try next path
    }
  }

  throw new ResourceNotFoundError(
    `Universal agent template not found. Searched: ${possiblePaths.join(", ")}`,
    "template",
    "universal-agent.md",
    { searchedPaths: possiblePaths },
  );
}

/**
 * Build a universal prompt from the template and context.
 *
 * @param ctx - Prompt context with task details
 * @returns Rendered prompt string
 *
 * @example
 * const prompt = await buildUniversalPrompt({
 *   taskId: "CG-AL-E001",
 *   taskDescription: "Create a simple table...",
 *   workspacePath: "/workspace",
 *   requiresTests: true,
 * });
 */
export async function buildUniversalPrompt(
  ctx: PromptContext,
): Promise<string> {
  const template = await loadTemplate();

  const variables: Record<string, string | boolean> = {
    TASK_ID: ctx.taskId,
    TASK_DESCRIPTION: ctx.taskDescription,
    WORKSPACE_PATH: ctx.workspacePath,
    REQUIRES_TESTS: ctx.requiresTests,
    APP_GUID: ctx.appGuid ?? generateGuid(),
  };

  return renderTemplate(template, variables);
}

/**
 * Build a universal prompt synchronously (requires template to be pre-loaded).
 *
 * @param template - Pre-loaded template string
 * @param ctx - Prompt context with task details
 * @returns Rendered prompt string
 */
export function buildUniversalPromptSync(
  template: string,
  ctx: PromptContext,
): string {
  const variables: Record<string, string | boolean> = {
    TASK_ID: ctx.taskId,
    TASK_DESCRIPTION: ctx.taskDescription,
    WORKSPACE_PATH: ctx.workspacePath,
    REQUIRES_TESTS: ctx.requiresTests,
    APP_GUID: ctx.appGuid ?? generateGuid(),
  };

  return renderTemplate(template, variables);
}

/**
 * Pre-load the template for repeated use.
 */
export async function preloadTemplate(): Promise<string> {
  return await loadTemplate();
}

// Re-export for convenience
export { renderTemplate };
