/**
 * Pushbullet notification client for benchmark completion notifications
 * @module src/notifications/pushbullet
 */

import { ConfigManager } from "../config/config.ts";

/**
 * Pushbullet API configuration
 */
export interface PushbulletConfig {
  accessToken: string;
  enabled?: boolean;
}

/**
 * Benchmark notification data
 */
export interface BenchmarkNotification {
  mode: "llm" | "agent";
  passRate: number;
  totalTasks: number;
  duration: number; // ms
  totalCost?: number; // $
  models?: string[]; // LLM mode
  agents?: string[]; // Agent mode
}

/**
 * Pushbullet API response for push creation
 */
interface PushbulletPushResponse {
  iden: string;
  type: string;
  title: string;
  body: string;
  created: number;
  modified: number;
  active: boolean;
}

/**
 * Format duration in milliseconds to human-readable string
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  } else if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${seconds}s`;
}

/**
 * Format cost to display string
 */
function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(2)}`;
}

/**
 * Format date and time for display
 */
function formatDateTime(date: Date): string {
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  };
  return date.toLocaleString("en-US", options);
}

/**
 * Build notification message body
 */
function buildNotificationBody(data: BenchmarkNotification): string {
  const passedTasks = Math.round(data.passRate * data.totalTasks);
  const passRatePercent = (data.passRate * 100).toFixed(1);

  const lines: string[] = [
    `Pass Rate: ${passRatePercent}% (${passedTasks}/${data.totalTasks} tasks)`,
  ];

  if (data.mode === "llm" && data.models && data.models.length > 0) {
    lines.push(`Models: ${data.models.join(", ")}`);
  } else if (data.mode === "agent" && data.agents && data.agents.length > 0) {
    lines.push(`Agents: ${data.agents.join(", ")}`);
  }

  lines.push(`Duration: ${formatDuration(data.duration)}`);

  if (data.totalCost !== undefined && data.totalCost > 0) {
    lines.push(`Cost: ${formatCost(data.totalCost)}`);
  }

  lines.push(`Completed: ${formatDateTime(new Date())}`);

  return lines.join("\n");
}

/**
 * Send a push notification via Pushbullet API
 */
async function sendPush(
  config: PushbulletConfig,
  title: string,
  body: string,
): Promise<void> {
  const response = await fetch("https://api.pushbullet.com/v2/pushes", {
    method: "POST",
    headers: {
      "Access-Token": config.accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "note",
      title,
      body,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Pushbullet API error (${response.status}): ${errorText}`);
  }

  // Verify response is valid
  const result = (await response.json()) as PushbulletPushResponse;
  if (!result.iden) {
    throw new Error("Pushbullet API returned invalid response");
  }
}

/**
 * Send a benchmark completion notification via Pushbullet
 *
 * @param config Pushbullet configuration (accessToken required)
 * @param data Benchmark completion data
 */
export async function sendBenchmarkNotification(
  config: PushbulletConfig,
  data: BenchmarkNotification,
): Promise<void> {
  if (!config.accessToken) {
    throw new Error("Pushbullet access token is required");
  }

  const title = "CentralGauge Benchmark Complete";
  const body = buildNotificationBody(data);

  await sendPush(config, title, body);
}

/**
 * Get Pushbullet configuration from environment or config file
 * Returns undefined if no token is configured
 */
export async function getPushbulletConfig(): Promise<
  PushbulletConfig | undefined
> {
  // Check environment variable first (highest priority)
  const envToken = Deno.env.get("PUSHBULLET_ACCESS_TOKEN");
  if (envToken) {
    return { accessToken: envToken, enabled: true };
  }

  // Check config file
  const config = await ConfigManager.loadConfig();
  const pbConfig = config.notifications?.pushbullet;

  if (pbConfig?.accessToken) {
    return {
      accessToken: pbConfig.accessToken,
      enabled: pbConfig.enabled ?? true,
    };
  }

  return undefined;
}

/**
 * Send benchmark notification if Pushbullet is configured
 * Silently skips if no token is configured
 * Logs warning on failure but doesn't throw
 *
 * @param data Benchmark completion data
 */
export async function sendBenchmarkNotificationIfConfigured(
  data: BenchmarkNotification,
): Promise<void> {
  try {
    const config = await getPushbulletConfig();

    if (!config) {
      // No token configured - silently skip
      return;
    }

    if (config.enabled === false) {
      // Explicitly disabled in config
      return;
    }

    await sendBenchmarkNotification(config, data);
  } catch (error) {
    // Log warning but don't fail the benchmark
    console.warn(
      `[Warn] Failed to send Pushbullet notification: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
