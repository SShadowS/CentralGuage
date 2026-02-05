/**
 * Notifications module - Push notifications for benchmark events
 * @module src/notifications
 */

// Types
export type { BenchmarkNotification, PushbulletConfig } from "./pushbullet.ts";

// Functions
export {
  getPushbulletConfig,
  sendBenchmarkNotification,
  sendBenchmarkNotificationIfConfigured,
} from "./pushbullet.ts";
