/**
 * Logger type definitions
 * @module src/logger/types
 */

/**
 * Log levels in order of severity.
 * debug (0) < info (1) < warn (2) < error (3)
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Priority values for log levels.
 * Higher values = more severe, fewer messages shown.
 */
export const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * A log event to be processed by transports.
 */
export interface LogEvent {
  /** Log level */
  level: LogLevel;
  /** When the log was created */
  timestamp: Date;
  /** Hierarchical namespace (e.g., "agent:executor", "llm:anthropic") */
  namespace: string;
  /** Human-readable message */
  message: string;
  /** Optional structured data */
  data?: Record<string, unknown>;
}

/**
 * Transport interface for log output destinations.
 * Transports receive LogEvents and handle output (console, file, etc.)
 */
export interface Transport {
  /** Transport identifier */
  readonly name: string;

  /**
   * Write a log event.
   * @param event - The log event to output
   */
  write(event: LogEvent): void;

  /**
   * Optional: Flush any buffered output.
   * Called before process exit or when explicitly requested.
   */
  flush?(): Promise<void>;
}

/**
 * Logger configuration.
 */
export interface LoggerConfig {
  /** Minimum log level to output (messages below this are filtered) */
  level: LogLevel;

  /** Transport(s) to send logs to */
  transports: Transport[];

  /** Enable/disable colored output (auto-detected from TTY if not specified) */
  colors?: boolean;
}

/**
 * Check if a log level should be output given the configured minimum level.
 */
export function shouldLog(
  eventLevel: LogLevel,
  configLevel: LogLevel,
): boolean {
  return LOG_LEVEL_PRIORITY[eventLevel] >= LOG_LEVEL_PRIORITY[configLevel];
}

/**
 * Parse a string to a LogLevel, with validation.
 * @param value - String to parse
 * @returns LogLevel if valid, undefined otherwise
 */
export function parseLogLevel(value: string | undefined): LogLevel | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (
    normalized === "debug" || normalized === "info" || normalized === "warn" ||
    normalized === "error"
  ) {
    return normalized;
  }
  return undefined;
}

/**
 * Check if a value is a valid LogLevel.
 */
export function isValidLogLevel(value: unknown): value is LogLevel {
  return value === "debug" || value === "info" || value === "warn" ||
    value === "error";
}
