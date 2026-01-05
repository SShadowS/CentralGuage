/**
 * Provider-agnostic tool definitions for AL code generation agents.
 *
 * These schemas use JSON Schema format which is compatible with:
 * - OpenAI function calling
 * - Anthropic Claude tools
 * - Google Gemini function declarations
 * - Azure OpenAI
 * - OpenRouter
 * - Local models with function calling support
 */

export interface ToolSchema {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required: string[];
  };
}

/**
 * AL compilation and testing tools for CentralGauge benchmark.
 */
export const AL_TOOL_SCHEMAS: ToolSchema[] = [
  {
    name: "al_compile",
    description:
      "Compile AL code in a Business Central container. Returns compilation result with success status and any errors or warnings. This is the PRIMARY tool for verifying code correctness.",
    parameters: {
      type: "object",
      properties: {
        projectDir: {
          type: "string",
          description:
            "Absolute path to directory containing app.json and .al source files",
        },
      },
      required: ["projectDir"],
    },
  },
  {
    name: "al_verify_task",
    description:
      "Compile AL code and run benchmark tests for a specific task. The test file is looked up by taskId, so the agent cannot see or modify tests. Use this after al_compile succeeds.",
    parameters: {
      type: "object",
      properties: {
        projectDir: {
          type: "string",
          description:
            "Absolute path to project directory containing app.json and .al files",
        },
        taskId: {
          type: "string",
          description: "Task ID to look up the test file (e.g., 'CG-AL-E001')",
        },
      },
      required: ["projectDir", "taskId"],
    },
  },
  {
    name: "al_container_status",
    description:
      "Check the health status of the Business Central container. Use this to verify the container is running before attempting compilation.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];

/**
 * Tool name mapping for different naming conventions.
 */
export type ToolNamingStyle = "generic" | "mcp";

/**
 * Get tool name based on naming style.
 *
 * @param baseName - Generic tool name (e.g., "al_compile")
 * @param style - Naming style to use
 * @returns Tool name in the requested style
 *
 * @example
 * getToolName("al_compile", "generic") // "al_compile"
 * getToolName("al_compile", "mcp")     // "mcp__al-tools__al_compile"
 */
export function getToolName(
  baseName: string,
  style: ToolNamingStyle = "generic",
): string {
  if (style === "mcp") {
    return `mcp__al-tools__${baseName}`;
  }
  return baseName;
}

/**
 * Check if a tool name matches one of our AL tools (in any naming style).
 *
 * @param toolName - Tool name to check
 * @returns The generic tool name if matched, null otherwise
 */
export function matchToolName(toolName: string): string | null {
  const genericNames = AL_TOOL_SCHEMAS.map((t) => t.name);

  // Check generic name
  if (genericNames.includes(toolName)) {
    return toolName;
  }

  // Check MCP-prefixed name
  for (const name of genericNames) {
    if (toolName === `mcp__al-tools__${name}`) {
      return name;
    }
  }

  return null;
}

/**
 * Convert tool schemas to OpenAI function calling format.
 */
export function toOpenAIFunctions(schemas: ToolSchema[] = AL_TOOL_SCHEMAS): {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: ToolSchema["parameters"];
  };
}[] {
  return schemas.map((schema) => ({
    type: "function" as const,
    function: {
      name: schema.name,
      description: schema.description,
      parameters: schema.parameters,
    },
  }));
}

/**
 * Convert tool schemas to Anthropic Claude tools format.
 */
export function toClaudeTools(schemas: ToolSchema[] = AL_TOOL_SCHEMAS): {
  name: string;
  description: string;
  input_schema: ToolSchema["parameters"];
}[] {
  return schemas.map((schema) => ({
    name: schema.name,
    description: schema.description,
    input_schema: schema.parameters,
  }));
}

/**
 * Convert tool schemas to Google Gemini function declarations format.
 */
export function toGeminiFunctions(schemas: ToolSchema[] = AL_TOOL_SCHEMAS): {
  name: string;
  description: string;
  parameters: ToolSchema["parameters"];
}[] {
  return schemas.map((schema) => ({
    name: schema.name,
    description: schema.description,
    parameters: schema.parameters,
  }));
}
