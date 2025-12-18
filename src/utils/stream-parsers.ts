/**
 * Shared stream parsing utilities for SSE and NDJSON formats.
 * Used by LLM adapters that need to parse streaming responses.
 */

/**
 * Parsed SSE event from a Server-Sent Events stream.
 */
export interface SSEEvent {
  /** The data payload (without "data: " prefix) */
  data: string;
  /** Whether this is the [DONE] signal */
  done: boolean;
}

/**
 * Parse a Server-Sent Events (SSE) stream.
 * Used by: Azure OpenAI, OpenAI-compatible REST endpoints.
 *
 * SSE format:
 * ```
 * data: {"key": "value"}\n
 * \n
 * data: [DONE]\n
 * ```
 *
 * @param reader - ReadableStream reader from fetch response.body
 * @param decoder - Optional TextDecoder (defaults to UTF-8)
 * @yields SSEEvent objects with data and done flag
 */
export async function* parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: TextDecoder = new TextDecoder(),
): AsyncGenerator<SSEEvent, void, undefined> {
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete lines
      const lines = buffer.split("\n");
      // Keep incomplete last line in buffer
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();

        // Skip empty lines and comments (lines starting with :)
        if (!trimmed || trimmed.startsWith(":")) {
          continue;
        }

        // Parse data lines
        if (trimmed.startsWith("data:")) {
          const data = trimmed.slice(5).trim();

          // Check for [DONE] signal
          if (data === "[DONE]") {
            yield { data: "", done: true };
            return;
          }

          yield { data, done: false };
        }
      }
    }

    // Process any remaining data in buffer
    if (buffer.trim()) {
      const trimmed = buffer.trim();
      if (trimmed.startsWith("data:")) {
        const data = trimmed.slice(5).trim();
        if (data !== "[DONE]") {
          yield { data, done: false };
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Parse a Newline-Delimited JSON (NDJSON) stream.
 * Used by: Ollama API.
 *
 * NDJSON format:
 * ```
 * {"response": "Hello", "done": false}\n
 * {"response": " world", "done": false}\n
 * {"response": "", "done": true, "eval_count": 10}\n
 * ```
 *
 * @param reader - ReadableStream reader from fetch response.body
 * @param decoder - Optional TextDecoder (defaults to UTF-8)
 * @yields Parsed JSON objects from each line
 */
export async function* parseNDJSONStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: TextDecoder = new TextDecoder(),
): AsyncGenerator<Record<string, unknown>, void, undefined> {
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete lines
      const lines = buffer.split("\n");
      // Keep incomplete last line in buffer
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const data = JSON.parse(trimmed) as Record<string, unknown>;
          yield data;

          // If this is the final chunk (Ollama signals with done: true)
          if (data["done"] === true) {
            return;
          }
        } catch {
          // Skip malformed JSON lines
          console.warn("[NDJSON] Failed to parse line:", trimmed);
        }
      }
    }

    // Process any remaining data in buffer
    if (buffer.trim()) {
      try {
        const data = JSON.parse(buffer.trim()) as Record<string, unknown>;
        yield data;
      } catch {
        console.warn("[NDJSON] Failed to parse remaining buffer:", buffer);
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Create a ReadableStream reader from a fetch Response.
 * Throws if the response body is null.
 *
 * @param response - Fetch Response object
 * @returns ReadableStream reader
 */
export function getStreamReader(
  response: Response,
): ReadableStreamDefaultReader<Uint8Array> {
  if (!response.body) {
    throw new Error("Response body is null - streaming not supported");
  }
  return response.body.getReader();
}
