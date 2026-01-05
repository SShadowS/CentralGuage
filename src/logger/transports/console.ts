/**
 * Console transport for colored terminal output
 * @module src/logger/transports/console
 */

import * as colors from "@std/fmt/colors";
import type { LogEvent, LogLevel, Transport } from "../types.ts";

/**
 * Color functions for each log level.
 */
const LEVEL_COLORS: Record<LogLevel, (s: string) => string> = {
  debug: colors.gray,
  info: colors.white,
  warn: colors.yellow,
  error: colors.red,
};

/**
 * Color functions for common namespace prefixes.
 * Falls back to white for unknown namespaces.
 */
const NAMESPACE_COLORS: Record<string, (s: string) => string> = {
  agent: colors.cyan,
  sandbox: colors.cyan,
  container: colors.cyan,
  llm: colors.magenta,
  task: colors.blue,
  compile: colors.yellow,
  test: colors.green,
  verify: colors.blue,
  mcp: colors.cyan,
  cli: colors.white,
  parallel: colors.magenta,
};

/**
 * Options for ConsoleTransport.
 */
export interface ConsoleTransportOptions {
  /** Enable/disable colors (default: auto-detect from TTY) */
  colors?: boolean;
  /** Include timestamp in output (default: false) */
  timestamps?: boolean;
  /** Include log level in output (default: true for debug/warn/error) */
  showLevel?: boolean;
}

/**
 * Console transport that outputs colored log messages to stdout/stderr.
 *
 * Format: `[namespace] message` with optional data
 * - debug: gray, goes to stdout
 * - info: namespace-colored, goes to stdout
 * - warn: yellow, goes to stderr
 * - error: red, goes to stderr
 */
export class ConsoleTransport implements Transport {
  readonly name = "console";
  private readonly useColors: boolean;
  private readonly showTimestamps: boolean;
  private readonly showLevel: boolean;

  constructor(options: ConsoleTransportOptions = {}) {
    // Auto-detect colors from TTY unless explicitly set
    this.useColors = options.colors ??
      (Deno.stdout.isTerminal() && Deno.stderr.isTerminal());
    this.showTimestamps = options.timestamps ?? false;
    this.showLevel = options.showLevel ?? true;
  }

  write(event: LogEvent): void {
    const formatted = this.format(event);

    // Route to appropriate stream
    if (event.level === "error" || event.level === "warn") {
      console.error(formatted);
    } else {
      console.log(formatted);
    }
  }

  /**
   * Format a log event for console output.
   */
  private format(event: LogEvent): string {
    const parts: string[] = [];

    // Optional timestamp
    if (this.showTimestamps) {
      const time = event.timestamp.toISOString().slice(11, 23); // HH:MM:SS.mmm
      parts.push(this.colorize(colors.gray, `[${time}]`));
    }

    // Level indicator (shown for debug/warn/error, or always if showLevel is true)
    if (this.showLevel && event.level !== "info") {
      const levelStr = event.level.toUpperCase();
      const levelColor = LEVEL_COLORS[event.level];
      parts.push(this.colorize(levelColor, `[${levelStr}]`));
    }

    // Namespace prefix
    const nsColor = this.getNamespaceColor(event.namespace);
    parts.push(this.colorize(nsColor, `[${event.namespace}]`));

    // Message
    parts.push(event.message);

    // Structured data (if present)
    if (event.data && Object.keys(event.data).length > 0) {
      const dataStr = this.formatData(event.data);
      parts.push(this.colorize(colors.gray, dataStr));
    }

    return parts.join(" ");
  }

  /**
   * Get the color function for a namespace.
   * Uses the first segment of hierarchical namespaces (e.g., "agent:executor" -> "agent").
   */
  private getNamespaceColor(namespace: string): (s: string) => string {
    const prefix = namespace.split(":")[0] || namespace;
    return NAMESPACE_COLORS[prefix] || colors.white;
  }

  /**
   * Apply a color function if colors are enabled.
   */
  private colorize(colorFn: (s: string) => string, text: string): string {
    return this.useColors ? colorFn(text) : text;
  }

  /**
   * Format structured data for output.
   * Produces compact inline format for simple data, or pretty-printed for complex.
   */
  private formatData(data: Record<string, unknown>): string {
    const entries = Object.entries(data);

    // Simple key=value format for small data
    if (
      entries.length <= 3 && entries.every(([, v]) => this.isSimpleValue(v))
    ) {
      const pairs = entries.map(([k, v]) => `${k}=${this.formatValue(v)}`);
      return `(${pairs.join(", ")})`;
    }

    // JSON for complex data
    return JSON.stringify(data);
  }

  /**
   * Check if a value is simple (string, number, boolean).
   */
  private isSimpleValue(value: unknown): boolean {
    return typeof value === "string" || typeof value === "number" ||
      typeof value === "boolean";
  }

  /**
   * Format a simple value for inline display.
   */
  private formatValue(value: unknown): string {
    if (typeof value === "string") {
      // Quote strings with spaces
      return value.includes(" ") ? `"${value}"` : value;
    }
    return String(value);
  }
}
