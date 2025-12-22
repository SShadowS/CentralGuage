/**
 * Notification Component - Toast-style notifications for TUI
 * Shows temporary messages that auto-dismiss or dismiss on keypress
 */
import { Text } from "tui/components";
import type { Tui } from "tui";
import { theme } from "../theme.ts";

export type NotificationType = "success" | "error" | "info" | "warning";

export interface NotificationOptions {
  parent: Tui;
  message: string;
  type?: NotificationType;
  duration?: number; // milliseconds, 0 = manual dismiss only
  row?: number;
  onDismiss?: () => void;
}

interface NotificationState {
  visible: boolean;
  textComponent: Text | null;
  timeoutId: number | null;
  keyHandler: ((event: { key: string }) => void) | null;
}

const state: NotificationState = {
  visible: false,
  textComponent: null,
  timeoutId: null,
  keyHandler: null,
};

/**
 * Get the theme style for a notification type
 */
function getNotificationStyle(type: NotificationType) {
  switch (type) {
    case "success":
      return theme.success;
    case "error":
      return theme.error;
    case "warning":
      return theme.warning;
    case "info":
    default:
      return theme.primary;
  }
}

/**
 * Get the prefix icon for a notification type
 */
function getNotificationPrefix(type: NotificationType): string {
  switch (type) {
    case "success":
      return "[OK]";
    case "error":
      return "[ERR]";
    case "warning":
      return "[WARN]";
    case "info":
    default:
      return "[INFO]";
  }
}

/**
 * Dismiss the current notification
 */
export function dismissNotification(parent: Tui): void {
  if (state.timeoutId !== null) {
    clearTimeout(state.timeoutId);
    state.timeoutId = null;
  }

  if (state.textComponent) {
    state.textComponent.destroy();
    state.textComponent = null;
  }

  if (state.keyHandler) {
    parent.off("keyPress", state.keyHandler);
    state.keyHandler = null;
  }

  state.visible = false;
}

/**
 * Show a notification message
 *
 * Only one notification can be shown at a time. Showing a new notification
 * will dismiss any existing one.
 */
export function showNotification(options: NotificationOptions): void {
  const {
    parent,
    message,
    type = "info",
    duration = 3000,
    row = 21,
    onDismiss,
  } = options;

  // Dismiss any existing notification
  dismissNotification(parent);

  const style = getNotificationStyle(type);
  const prefix = getNotificationPrefix(type);
  const fullMessage = `${prefix} ${message}`;

  // Create the text component
  state.textComponent = new Text({
    parent,
    text: fullMessage,
    rectangle: { column: 2, row, width: 56 },
    theme: { base: style },
    zIndex: 100, // High z-index to show on top
  });

  state.visible = true;

  // Set up auto-dismiss timer
  if (duration > 0) {
    state.timeoutId = setTimeout(() => {
      dismissNotification(parent);
      onDismiss?.();
    }, duration);
  }

  // Set up key handler for manual dismiss
  state.keyHandler = (_event: { key: string }) => {
    // Any key dismisses the notification
    if (state.visible) {
      dismissNotification(parent);
      onDismiss?.();
    }
  };
  parent.on("keyPress", state.keyHandler);
}

/**
 * Show a success notification
 */
export function showSuccess(
  parent: Tui,
  message: string,
  duration = 3000,
): void {
  showNotification({ parent, message, type: "success", duration });
}

/**
 * Show an error notification
 */
export function showError(parent: Tui, message: string, duration = 5000): void {
  showNotification({ parent, message, type: "error", duration });
}

/**
 * Show an info notification
 */
export function showInfo(parent: Tui, message: string, duration = 3000): void {
  showNotification({ parent, message, type: "info", duration });
}

/**
 * Show a warning notification
 */
export function showWarning(
  parent: Tui,
  message: string,
  duration = 4000,
): void {
  showNotification({ parent, message, type: "warning", duration });
}
