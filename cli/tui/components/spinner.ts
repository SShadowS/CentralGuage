/**
 * Spinner Component - Loading indicator for async operations
 * Shows an animated spinner with optional message
 */
import { Signal } from "tui";
import { Text } from "tui/components";
import type { Tui } from "tui";
import { theme } from "../theme.ts";

// Spinner animation frames
const SPINNER_FRAMES = ["|", "/", "-", "\\"];
const SPINNER_INTERVAL = 100; // ms between frames

export interface SpinnerOptions {
  parent: Tui;
  message?: string;
  row: number;
  column?: number;
}

export interface SpinnerInstance {
  /** Update the spinner message */
  setMessage: (message: string) => void;
  /** Stop and remove the spinner */
  stop: () => void;
  /** Check if spinner is running */
  isRunning: () => boolean;
}

/**
 * Create and start a spinner
 *
 * @param options - Spinner configuration
 * @returns Spinner instance with control methods
 */
export function createSpinner(options: SpinnerOptions): SpinnerInstance {
  const { parent, message = "Loading...", row, column = 2 } = options;

  let frameIndex = 0;
  let intervalId: number | null = null;
  let running = true;

  // Signal for the display text
  const displayText = new Signal(`${SPINNER_FRAMES[0]} ${message}`);

  // Create the text component
  const textComponent = new Text({
    parent,
    text: displayText,
    rectangle: { column, row, width: 50 },
    theme: { base: theme.primary },
    zIndex: 50,
  });

  // Start animation
  intervalId = setInterval(() => {
    frameIndex = (frameIndex + 1) % SPINNER_FRAMES.length;
    const frame = SPINNER_FRAMES[frameIndex];
    const currentMessage = displayText.value.substring(2); // Remove old frame + space
    displayText.value = `${frame} ${currentMessage}`;
  }, SPINNER_INTERVAL);

  return {
    setMessage: (newMessage: string) => {
      const frame = SPINNER_FRAMES[frameIndex];
      displayText.value = `${frame} ${newMessage}`;
    },

    stop: () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
      running = false;
      textComponent.destroy();
    },

    isRunning: () => running,
  };
}

/**
 * Show a spinner while an async operation runs
 *
 * @param options - Spinner configuration
 * @param operation - Async function to run
 * @returns Result of the operation
 */
export async function withSpinner<T>(
  options: SpinnerOptions,
  operation: () => Promise<T>,
): Promise<T> {
  const spinner = createSpinner(options);
  try {
    return await operation();
  } finally {
    spinner.stop();
  }
}
