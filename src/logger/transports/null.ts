/**
 * Null transport for testing and silent operation
 * @module src/logger/transports/null
 */

import type { LogEvent, Transport } from "../types.ts";

/**
 * A transport that captures log events without outputting them.
 * Useful for testing and for running in silent mode.
 *
 * @example
 * ```ts
 * const transport = new NullTransport();
 * Logger.configure({ level: "debug", transports: [transport] });
 *
 * log.info("test message");
 *
 * assertEquals(transport.events.length, 1);
 * assertEquals(transport.events[0].message, "test message");
 * ```
 */
export class NullTransport implements Transport {
  readonly name = "null";

  /** Captured log events */
  readonly events: LogEvent[] = [];

  write(event: LogEvent): void {
    this.events.push(event);
  }

  /**
   * Clear all captured events.
   */
  clear(): void {
    this.events.length = 0;
  }

  /**
   * Get events filtered by level.
   */
  getByLevel(level: LogEvent["level"]): LogEvent[] {
    return this.events.filter((e) => e.level === level);
  }

  /**
   * Get events filtered by namespace.
   */
  getByNamespace(namespace: string): LogEvent[] {
    return this.events.filter((e) =>
      e.namespace === namespace || e.namespace.startsWith(`${namespace}:`)
    );
  }

  /**
   * Check if any event matches the given message substring.
   */
  hasMessage(substring: string): boolean {
    return this.events.some((e) => e.message.includes(substring));
  }

  /**
   * Get the last N events.
   */
  getLast(count = 1): LogEvent[] {
    return this.events.slice(-count);
  }
}
