/**
 * Unit tests for the unified Logger
 */

import { assertEquals, assertExists } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import {
  isValidLogLevel,
  Logger,
  type LogLevel,
  NullTransport,
  parseLogLevel,
  shouldLog,
} from "../../../src/logger/mod.ts";

describe("Logger", () => {
  let transport: NullTransport;

  beforeEach(() => {
    transport = new NullTransport();
    Logger.reset();
    Logger.configure({
      level: "debug",
      transports: [transport],
    });
  });

  afterEach(() => {
    Logger.reset();
  });

  describe("create", () => {
    it("creates a logger with namespace", () => {
      const log = Logger.create("test");
      log.info("message");

      assertEquals(transport.events.length, 1);
      const event = transport.events[0];
      assertExists(event);
      assertEquals(event.namespace, "test");
    });

    it("creates child loggers with extended namespace", () => {
      const parent = Logger.create("parent");
      const child = parent.child("child");
      child.info("message");

      assertEquals(transport.events.length, 1);
      const event = transport.events[0];
      assertExists(event);
      assertEquals(event.namespace, "parent:child");
    });
  });

  describe("log levels", () => {
    it("logs debug messages when level is debug", () => {
      const log = Logger.create("test");
      log.debug("debug message");

      assertEquals(transport.events.length, 1);
      const event = transport.events[0];
      assertExists(event);
      assertEquals(event.level, "debug");
    });

    it("filters debug messages when level is info", () => {
      Logger.configure({ level: "info", transports: [transport] });
      const log = Logger.create("test");

      log.debug("hidden");
      log.info("shown");

      assertEquals(transport.events.length, 1);
      const event = transport.events[0];
      assertExists(event);
      assertEquals(event.message, "shown");
    });

    it("filters info messages when level is warn", () => {
      Logger.configure({ level: "warn", transports: [transport] });
      const log = Logger.create("test");

      log.debug("hidden");
      log.info("hidden");
      log.warn("shown");

      assertEquals(transport.events.length, 1);
      const event = transport.events[0];
      assertExists(event);
      assertEquals(event.message, "shown");
    });

    it("only shows errors when level is error", () => {
      Logger.configure({ level: "error", transports: [transport] });
      const log = Logger.create("test");

      log.debug("hidden");
      log.info("hidden");
      log.warn("hidden");
      log.error("shown");

      assertEquals(transport.events.length, 1);
      const event = transport.events[0];
      assertExists(event);
      assertEquals(event.message, "shown");
    });
  });

  describe("log methods", () => {
    it("logs with correct level for each method", () => {
      const log = Logger.create("test");

      log.debug("d");
      log.info("i");
      log.warn("w");
      log.error("e");

      assertEquals(transport.events.length, 4);
      assertEquals(transport.events[0]?.level, "debug");
      assertEquals(transport.events[1]?.level, "info");
      assertEquals(transport.events[2]?.level, "warn");
      assertEquals(transport.events[3]?.level, "error");
    });

    it("includes data when provided", () => {
      const log = Logger.create("test");
      log.info("message", { key: "value", count: 42 });

      assertEquals(transport.events.length, 1);
      const event = transport.events[0];
      assertExists(event);
      assertExists(event.data);
      assertEquals(event.data["key"], "value");
      assertEquals(event.data["count"], 42);
    });

    it("does not include data when not provided", () => {
      const log = Logger.create("test");
      log.info("message");

      assertEquals(transport.events.length, 1);
      const event = transport.events[0];
      assertExists(event);
      assertEquals(event.data, undefined);
    });

    it("includes timestamp", () => {
      const before = new Date();
      const log = Logger.create("test");
      log.info("message");
      const after = new Date();

      assertEquals(transport.events.length, 1);
      const event = transport.events[0];
      assertExists(event);
      const timestamp = event.timestamp;
      assertEquals(timestamp >= before, true);
      assertEquals(timestamp <= after, true);
    });
  });

  describe("configuration", () => {
    it("setLevel changes the global level", () => {
      Logger.setLevel("error");
      assertEquals(Logger.getLevel(), "error");
    });

    it("isEnabled returns correct values", () => {
      Logger.configure({ level: "warn", transports: [transport] });

      assertEquals(Logger.isEnabled("debug"), false);
      assertEquals(Logger.isEnabled("info"), false);
      assertEquals(Logger.isEnabled("warn"), true);
      assertEquals(Logger.isEnabled("error"), true);
    });

    it("reset restores defaults", () => {
      Logger.configure({ level: "error", transports: [transport] });
      Logger.reset();

      // After reset, should use default level (info)
      assertEquals(Logger.getLevel(), "info");
    });
  });
});

describe("NullTransport", () => {
  it("captures events", () => {
    const transport = new NullTransport();
    transport.write({
      level: "info",
      timestamp: new Date(),
      namespace: "test",
      message: "hello",
    });

    assertEquals(transport.events.length, 1);
    const event = transport.events[0];
    assertExists(event);
    assertEquals(event.message, "hello");
  });

  it("clears captured events", () => {
    const transport = new NullTransport();
    transport.write({
      level: "info",
      timestamp: new Date(),
      namespace: "test",
      message: "hello",
    });
    transport.clear();

    assertEquals(transport.events.length, 0);
  });

  it("getByLevel filters by level", () => {
    const transport = new NullTransport();
    transport.write({
      level: "info",
      timestamp: new Date(),
      namespace: "a",
      message: "1",
    });
    transport.write({
      level: "warn",
      timestamp: new Date(),
      namespace: "b",
      message: "2",
    });
    transport.write({
      level: "info",
      timestamp: new Date(),
      namespace: "c",
      message: "3",
    });

    const infoEvents = transport.getByLevel("info");
    assertEquals(infoEvents.length, 2);
  });

  it("getByNamespace filters by namespace", () => {
    const transport = new NullTransport();
    transport.write({
      level: "info",
      timestamp: new Date(),
      namespace: "agent",
      message: "1",
    });
    transport.write({
      level: "info",
      timestamp: new Date(),
      namespace: "agent:executor",
      message: "2",
    });
    transport.write({
      level: "info",
      timestamp: new Date(),
      namespace: "container",
      message: "3",
    });

    const agentEvents = transport.getByNamespace("agent");
    assertEquals(agentEvents.length, 2);
  });

  it("hasMessage checks for substring", () => {
    const transport = new NullTransport();
    transport.write({
      level: "info",
      timestamp: new Date(),
      namespace: "test",
      message: "hello world",
    });

    assertEquals(transport.hasMessage("world"), true);
    assertEquals(transport.hasMessage("foo"), false);
  });

  it("getLast returns last N events", () => {
    const transport = new NullTransport();
    transport.write({
      level: "info",
      timestamp: new Date(),
      namespace: "test",
      message: "1",
    });
    transport.write({
      level: "info",
      timestamp: new Date(),
      namespace: "test",
      message: "2",
    });
    transport.write({
      level: "info",
      timestamp: new Date(),
      namespace: "test",
      message: "3",
    });

    const last = transport.getLast(2);
    assertEquals(last.length, 2);
    assertEquals(last[0]?.message, "2");
    assertEquals(last[1]?.message, "3");
  });
});

describe("shouldLog", () => {
  const testCases: Array<
    { event: LogLevel; config: LogLevel; expected: boolean }
  > = [
    // debug config - everything shows
    { event: "debug", config: "debug", expected: true },
    { event: "info", config: "debug", expected: true },
    { event: "warn", config: "debug", expected: true },
    { event: "error", config: "debug", expected: true },
    // info config - debug hidden
    { event: "debug", config: "info", expected: false },
    { event: "info", config: "info", expected: true },
    { event: "warn", config: "info", expected: true },
    { event: "error", config: "info", expected: true },
    // warn config - debug and info hidden
    { event: "debug", config: "warn", expected: false },
    { event: "info", config: "warn", expected: false },
    { event: "warn", config: "warn", expected: true },
    { event: "error", config: "warn", expected: true },
    // error config - only error shows
    { event: "debug", config: "error", expected: false },
    { event: "info", config: "error", expected: false },
    { event: "warn", config: "error", expected: false },
    { event: "error", config: "error", expected: true },
  ];

  for (const { event, config, expected } of testCases) {
    it(`${event} at ${config} level = ${expected}`, () => {
      assertEquals(shouldLog(event, config), expected);
    });
  }
});

describe("parseLogLevel", () => {
  it("parses valid levels", () => {
    assertEquals(parseLogLevel("debug"), "debug");
    assertEquals(parseLogLevel("info"), "info");
    assertEquals(parseLogLevel("warn"), "warn");
    assertEquals(parseLogLevel("error"), "error");
  });

  it("is case insensitive", () => {
    assertEquals(parseLogLevel("DEBUG"), "debug");
    assertEquals(parseLogLevel("Info"), "info");
    assertEquals(parseLogLevel("WARN"), "warn");
  });

  it("returns undefined for invalid levels", () => {
    assertEquals(parseLogLevel("invalid"), undefined);
    assertEquals(parseLogLevel(""), undefined);
    assertEquals(parseLogLevel(undefined), undefined);
  });
});

describe("isValidLogLevel", () => {
  it("returns true for valid levels", () => {
    assertEquals(isValidLogLevel("debug"), true);
    assertEquals(isValidLogLevel("info"), true);
    assertEquals(isValidLogLevel("warn"), true);
    assertEquals(isValidLogLevel("error"), true);
  });

  it("returns false for invalid values", () => {
    assertEquals(isValidLogLevel("invalid"), false);
    assertEquals(isValidLogLevel(""), false);
    assertEquals(isValidLogLevel(null), false);
    assertEquals(isValidLogLevel(undefined), false);
    assertEquals(isValidLogLevel(42), false);
  });
});
