/**
 * Unit tests for SSE and NDJSON stream parsers.
 */

import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import {
  getStreamReader,
  parseNDJSONStream,
  parseSSEStream,
} from "../../src/utils/stream-parsers.ts";

// Helper to create a ReadableStream from an array of chunks
function createMockStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;

  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });
}

describe("Stream Parsers", () => {
  describe("parseSSEStream", () => {
    it("should parse basic SSE data lines", async () => {
      const chunks = [
        'data: {"content": "Hello"}\n\n',
        'data: {"content": " World"}\n\n',
        "data: [DONE]\n\n",
      ];

      const stream = createMockStream(chunks);
      const reader = stream.getReader();
      const events: Array<{ data: string; done: boolean }> = [];

      for await (const event of parseSSEStream(reader)) {
        events.push(event);
      }

      assertEquals(events.length, 3);
      assertEquals(events[0], { data: '{"content": "Hello"}', done: false });
      assertEquals(events[1], { data: '{"content": " World"}', done: false });
      assertEquals(events[2], { data: "", done: true });
    });

    it("should skip comment lines (starting with :)", async () => {
      const chunks = [
        ": this is a comment\n",
        'data: {"content": "test"}\n\n',
        "data: [DONE]\n\n",
      ];

      const stream = createMockStream(chunks);
      const reader = stream.getReader();
      const events: Array<{ data: string; done: boolean }> = [];

      for await (const event of parseSSEStream(reader)) {
        events.push(event);
      }

      assertEquals(events.length, 2);
      assertEquals(events[0], { data: '{"content": "test"}', done: false });
    });

    it("should handle data split across chunks", async () => {
      // Data split in the middle of a line
      const chunks = [
        'data: {"content":',
        ' "split"}\n\n',
      ];

      const stream = createMockStream(chunks);
      const reader = stream.getReader();
      const events: Array<{ data: string; done: boolean }> = [];

      for await (const event of parseSSEStream(reader)) {
        events.push(event);
      }

      assertEquals(events.length, 1);
      assertEquals(events[0], { data: '{"content": "split"}', done: false });
    });

    it("should handle empty lines", async () => {
      const chunks = [
        "\n\n",
        'data: {"content": "test"}\n\n',
        "\n",
        "data: [DONE]\n\n",
      ];

      const stream = createMockStream(chunks);
      const reader = stream.getReader();
      const events: Array<{ data: string; done: boolean }> = [];

      for await (const event of parseSSEStream(reader)) {
        events.push(event);
      }

      assertEquals(events.length, 2);
    });
  });

  describe("parseNDJSONStream", () => {
    it("should parse basic NDJSON lines", async () => {
      const chunks = [
        '{"response": "Hello", "done": false}\n',
        '{"response": " World", "done": false}\n',
        '{"response": "", "done": true, "eval_count": 10}\n',
      ];

      const stream = createMockStream(chunks);
      const reader = stream.getReader();
      const events: Array<Record<string, unknown>> = [];

      for await (const event of parseNDJSONStream(reader)) {
        events.push(event);
      }

      // Should stop after done: true
      assertEquals(events.length, 3);
      assertEquals(events[0], { response: "Hello", done: false });
      assertEquals(events[1], { response: " World", done: false });
      assertEquals(events[2], { response: "", done: true, eval_count: 10 });
    });

    it("should handle data split across chunks", async () => {
      const chunks = [
        '{"response": "test',
        '", "done": false}\n',
      ];

      const stream = createMockStream(chunks);
      const reader = stream.getReader();
      const events: Array<Record<string, unknown>> = [];

      for await (const event of parseNDJSONStream(reader)) {
        events.push(event);
      }

      assertEquals(events.length, 1);
      assertEquals(events[0], { response: "test", done: false });
    });

    it("should skip empty lines", async () => {
      const chunks = [
        "\n",
        '{"response": "test", "done": false}\n',
        "\n\n",
        '{"response": "", "done": true}\n',
      ];

      const stream = createMockStream(chunks);
      const reader = stream.getReader();
      const events: Array<Record<string, unknown>> = [];

      for await (const event of parseNDJSONStream(reader)) {
        events.push(event);
      }

      assertEquals(events.length, 2);
    });

    it("should stop iteration when done: true is received", async () => {
      const chunks = [
        '{"response": "first", "done": false}\n',
        '{"response": "", "done": true}\n',
        '{"response": "should not appear", "done": false}\n', // Should be ignored
      ];

      const stream = createMockStream(chunks);
      const reader = stream.getReader();
      const events: Array<Record<string, unknown>> = [];

      for await (const event of parseNDJSONStream(reader)) {
        events.push(event);
      }

      // Should stop after done: true
      assertEquals(events.length, 2);
      assertEquals(events[0], { response: "first", done: false });
      assertEquals(events[1], { response: "", done: true });
    });
  });

  describe("getStreamReader", () => {
    it("should return a reader from a response with a body", () => {
      const stream = createMockStream(["test"]);
      const response = new Response(stream);
      const reader = getStreamReader(response);

      assertEquals(typeof reader.read, "function");
    });

    it("should throw if response body is null", () => {
      const response = new Response(null);
      let threw = false;

      try {
        getStreamReader(response);
      } catch {
        threw = true;
      }

      assertEquals(threw, true);
    });
  });
});
