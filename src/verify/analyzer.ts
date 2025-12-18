/**
 * LLM-based failure analyzer for the verify command
 * Analyzes failing tasks to determine if they are fixable issues or model knowledge gaps
 */

import { exists } from "@std/fs";
import { LLMAdapterRegistry } from "../llm/registry.ts";
import type { LLMConfig, LLMRequest } from "../llm/types.ts";
import type {
  AnalysisContext,
  AnalysisResult,
  ConfidenceLevel,
  FailingTask,
  FixableAnalysisResult,
  FixableCategory,
  ModelShortcomingResult,
} from "./types.ts";

/**
 * Configuration for the failure analyzer
 */
export interface AnalyzerConfig {
  /** LLM provider to use (e.g., "anthropic", "openai") */
  provider: string;
  /** Model to use for analysis */
  model: string;
  /** Temperature for LLM calls */
  temperature: number;
  /** Max tokens for response */
  maxTokens: number;
  /** API key (optional if set via env) */
  apiKey?: string;
}

/**
 * Default analyzer configuration
 */
export const DEFAULT_ANALYZER_CONFIG: AnalyzerConfig = {
  provider: "anthropic",
  model: "claude-sonnet-4-5-20250929",
  temperature: 0.1,
  maxTokens: 4000,
};

/**
 * Build the analysis prompt for a failing task
 */
function buildAnalysisPrompt(
  task: FailingTask,
  context: AnalysisContext,
): string {
  const errorSection = task.failureType === "compilation"
    ? formatCompilationErrors(task)
    : formatTestErrors(task);

  return `# CentralGauge Task Failure Analysis

You are analyzing a failing benchmark task from CentralGauge, an AL (Business Central) code generation benchmark.
Your goal is to determine the ROOT CAUSE of this failure and classify it correctly.

## Task Definition (YAML)
\`\`\`yaml
${context.taskYaml}
\`\`\`

## Test File (AL)
\`\`\`al
${context.testAl}
\`\`\`

## Generated Code (AL) - What the model produced
\`\`\`al
${context.generatedCode}
\`\`\`

## Failure Information
**Type**: ${task.failureType}
${errorSection}

---

## CRITICAL: Determine Failure Type

You MUST classify this failure into ONE of these categories:

### A) FIXABLE ISSUES (problems in task/test definitions)
These require us to fix our benchmark files:
- **id_conflict**: Object IDs clash with BC objects or other tasks
- **syntax_error**: Invalid AL syntax in TEST file (not generated code)
- **test_logic_bug**: Test has incorrect assertions, always passes/fails, or wrong logic
- **task_definition_issue**: Task YAML is ambiguous, impossible, or incorrectly specified

### B) MODEL KNOWLEDGE GAP (model lacks AL knowledge - test is valid)
The task and test are CORRECT, but the model generated wrong AL code because it doesn't know:
- AL syntax rules (e.g., interfaces don't have IDs)
- BC API patterns (e.g., FlowField requires CalcFields call)
- AL best practices (e.g., temporary table handling)
- BC object types and their properties

**IMPORTANT**: If the task and test are valid but the model simply wrote incorrect code,
this is a MODEL KNOWLEDGE GAP, not a fixable issue. We track these to understand model limitations.

---

## Response Format

Respond with ONLY a JSON object (no markdown code blocks, just raw JSON):

For FIXABLE issues:
{
  "outcome": "fixable",
  "category": "id_conflict|syntax_error|test_logic_bug|task_definition_issue",
  "description": "Detailed explanation of what's wrong with the task/test",
  "affectedFile": "task_yaml|test_al",
  "fix": {
    "filePath": "${
    task.failureType === "compilation" ? task.testAlPath : task.taskYamlPath
  }",
    "description": "What needs to change",
    "codeBefore": "The problematic code snippet",
    "codeAfter": "The corrected code snippet"
  },
  "confidence": "high|medium|low"
}

For MODEL SHORTCOMINGS:
{
  "outcome": "model_shortcoming",
  "category": "model_knowledge_gap",
  "concept": "Short name for the AL concept (e.g., 'interface-id-syntax')",
  "alConcept": "Broader category (e.g., 'interface-definition', 'flowfield', 'temporary-table')",
  "description": "What the model got wrong and why",
  "errorCode": "${task.compilationErrors?.[0]?.code || ""}",
  "generatedCode": "The incorrect code the model wrote (excerpt)",
  "correctPattern": "What it should have written",
  "confidence": "high|medium|low"
}`;
}

/**
 * Format compilation errors for the prompt
 */
function formatCompilationErrors(task: FailingTask): string {
  if (!task.compilationErrors || task.compilationErrors.length === 0) {
    return "**Errors**: No specific errors captured";
  }

  const errors = task.compilationErrors
    .slice(0, 10) // Limit to first 10 errors
    .map((e) => `- [${e.code}] ${e.file}:${e.line}:${e.column}: ${e.message}`)
    .join("\n");

  return `**Compilation Errors**:
${errors}`;
}

/**
 * Format test errors for the prompt
 */
function formatTestErrors(task: FailingTask): string {
  if (!task.testResults || task.testResults.length === 0) {
    return `**Test Output**:
${task.output.slice(0, 2000)}`;
  }

  const failures = task.testResults
    .filter((t) => !t.passed)
    .map((t) => `- ${t.name}: ${t.error || "Failed"}`)
    .join("\n");

  return `**Failed Tests**:
${failures}

**Output**:
${task.output.slice(0, 1500)}`;
}

/**
 * Load context files for a failing task
 */
async function loadAnalysisContext(
  task: FailingTask,
): Promise<AnalysisContext> {
  // Load task YAML
  let taskYaml = "# Task file not found";
  if (await exists(task.taskYamlPath)) {
    taskYaml = await Deno.readTextFile(task.taskYamlPath);
  }

  // Load test AL file
  let testAl = "// Test file not found";
  if (await exists(task.testAlPath)) {
    testAl = await Deno.readTextFile(task.testAlPath);
  }

  // Load generated code from artifacts
  let generatedCode = "// Generated code not found";
  if (await exists(task.generatedCodePath)) {
    // Find .al files in the project directory (excluding test files)
    const alFiles: string[] = [];
    try {
      for await (const entry of Deno.readDir(task.generatedCodePath)) {
        if (
          entry.isFile &&
          entry.name.endsWith(".al") &&
          !entry.name.includes(".Test.")
        ) {
          alFiles.push(`${task.generatedCodePath}/${entry.name}`);
        }
      }

      if (alFiles.length > 0) {
        const contents = await Promise.all(
          alFiles.map(async (f) => {
            const content = await Deno.readTextFile(f);
            return `// File: ${f.split("/").pop()}\n${content}`;
          }),
        );
        generatedCode = contents.join("\n\n");
      }
    } catch {
      // Directory doesn't exist or can't be read
    }
  }

  return {
    taskYaml,
    testAl,
    generatedCode,
    compilationErrors: task.compilationErrors,
    testOutput: task.output,
  };
}

/**
 * Parse LLM response into an AnalysisResult
 * Exported for testing
 */
export function parseAnalysisResponse(
  response: string,
  task: FailingTask,
): AnalysisResult {
  // Try to extract JSON from the response
  let jsonStr = response.trim();

  // Remove markdown code blocks if present
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonMatch && jsonMatch[1]) {
    jsonStr = jsonMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(jsonStr);

    if (parsed.outcome === "fixable") {
      // Always use the correct path from the task, not the LLM's suggestion
      const isTaskYamlFix = parsed.affectedFile === "task_yaml";
      const correctFilePath = isTaskYamlFix
        ? task.taskYamlPath
        : task.testAlPath;

      return {
        outcome: "fixable",
        taskId: task.taskId,
        model: task.model,
        category: parsed.category as FixableCategory,
        description: parsed.description || "No description provided",
        fix: {
          fileType: isTaskYamlFix ? "task_yaml" : "test_al",
          filePath: correctFilePath,
          description: parsed.fix?.description || "No fix description",
          codeBefore: parsed.fix?.codeBefore || "",
          codeAfter: parsed.fix?.codeAfter || "",
        },
        confidence: (parsed.confidence || "medium") as ConfidenceLevel,
      } satisfies FixableAnalysisResult;
    } else if (parsed.outcome === "model_shortcoming") {
      return {
        outcome: "model_shortcoming",
        taskId: task.taskId,
        model: task.model,
        category: "model_knowledge_gap",
        concept: parsed.concept || "unknown-concept",
        alConcept: parsed.alConcept || "unknown",
        description: parsed.description || "No description provided",
        errorCode: parsed.errorCode,
        generatedCode: parsed.generatedCode || "",
        correctPattern: parsed.correctPattern || "",
        confidence: (parsed.confidence || "medium") as ConfidenceLevel,
      } satisfies ModelShortcomingResult;
    }
  } catch {
    // JSON parsing failed, fall back to model shortcoming with low confidence
  }

  // Default fallback - assume model shortcoming if we can't parse
  return {
    outcome: "model_shortcoming",
    taskId: task.taskId,
    model: task.model,
    category: "model_knowledge_gap",
    concept: "parse-failure",
    alConcept: "unknown",
    description: `Failed to parse LLM analysis response: ${
      response.slice(0, 200)
    }`,
    generatedCode: "",
    correctPattern: "",
    confidence: "low",
  } satisfies ModelShortcomingResult;
}

/**
 * Failure analyzer class
 */
export class FailureAnalyzer {
  private config: AnalyzerConfig;

  constructor(config?: Partial<AnalyzerConfig>) {
    this.config = { ...DEFAULT_ANALYZER_CONFIG, ...config };
  }

  /**
   * Analyze a single failing task
   */
  async analyzeTask(task: FailingTask): Promise<AnalysisResult> {
    // Load context files
    const context = await loadAnalysisContext(task);

    // Build prompt
    const prompt = buildAnalysisPrompt(task, context);

    // Get LLM adapter
    const llmConfig: LLMConfig = {
      provider: this.config.provider,
      model: this.config.model,
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens,
      apiKey: this.config.apiKey,
    };

    const adapter = LLMAdapterRegistry.acquire(this.config.provider, llmConfig);

    try {
      // Call LLM
      const request: LLMRequest = {
        prompt,
        systemPrompt:
          "You are an expert AL (Business Central) developer analyzing benchmark task failures. " +
          "Respond only with valid JSON, no markdown or explanation.",
        temperature: this.config.temperature,
        maxTokens: this.config.maxTokens,
      };

      // Use generateCode since it's a general purpose method
      const generationContext = {
        taskId: task.taskId,
        attempt: 1,
        model: this.config.model,
        description: "Failure analysis",
        instructions: prompt,
      };

      const result = await adapter.generateCode(request, generationContext);

      // Parse response
      return parseAnalysisResponse(result.response.content, task);
    } finally {
      // Release adapter back to pool
      LLMAdapterRegistry.release(adapter);
    }
  }

  /**
   * Analyze a task with pre-loaded context
   */
  async analyzeWithContext(
    task: FailingTask,
    context: AnalysisContext,
  ): Promise<AnalysisResult> {
    const prompt = buildAnalysisPrompt(task, context);

    const llmConfig: LLMConfig = {
      provider: this.config.provider,
      model: this.config.model,
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens,
      apiKey: this.config.apiKey,
    };

    const adapter = LLMAdapterRegistry.acquire(this.config.provider, llmConfig);

    try {
      const request: LLMRequest = {
        prompt,
        systemPrompt:
          "You are an expert AL (Business Central) developer analyzing benchmark task failures. " +
          "Respond only with valid JSON, no markdown or explanation.",
        temperature: this.config.temperature,
        maxTokens: this.config.maxTokens,
      };

      const generationContext = {
        taskId: task.taskId,
        attempt: 1,
        model: this.config.model,
        description: "Failure analysis",
        instructions: prompt,
      };

      const result = await adapter.generateCode(request, generationContext);

      return parseAnalysisResponse(result.response.content, task);
    } finally {
      LLMAdapterRegistry.release(adapter);
    }
  }
}
