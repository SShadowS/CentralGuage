/**
 * Modal Component - Overlay dialog for TUI
 * Displays content in a centered box with keyboard navigation
 */
import { Text } from "tui/components";
import type { Tui } from "tui";
import { keys, layout, theme } from "../theme.ts";

export interface ModalOptions {
  parent: Tui;
  title: string;
  content: string | string[]; // Single string or array of lines
  width?: number;
  height?: number;
  onClose?: (() => void) | undefined;
  actions?: ModalAction[];
}

export interface ModalAction {
  label: string;
  key: string; // e.g., "enter", "y", "n"
  action: () => void;
}

export interface ModalInstance {
  close: () => void;
  scrollUp: () => void;
  scrollDown: () => void;
}

interface ModalState {
  components: Text[];
  keyHandler: ((event: { key: string }) => void) | null;
  scrollOffset: number;
  contentLines: string[];
  visibleLines: number;
}

/**
 * Create and show a modal dialog
 */
export function showModal(options: ModalOptions): ModalInstance {
  const {
    parent,
    title,
    content,
    width = 50,
    height = 15,
    onClose,
    actions = [],
  } = options;

  const state: ModalState = {
    components: [],
    keyHandler: null,
    scrollOffset: 0,
    contentLines: [],
    visibleLines: height - 4, // Account for border, title, and footer
  };

  // Parse content into lines
  if (typeof content === "string") {
    state.contentLines = wrapText(content, width - 4);
  } else {
    state.contentLines = content.flatMap((line) => wrapText(line, width - 4));
  }

  // Calculate position (centered)
  const startCol = Math.floor((layout.screenWidth - width) / 2) +
    layout.padding;
  const startRow = Math.floor((24 - height) / 2); // Assume 24 row terminal

  // Draw modal box
  drawModalBox(
    parent,
    state,
    startCol,
    startRow,
    width,
    height,
    title,
    actions,
  );

  // Draw initial content
  updateContent(parent, state, startCol, startRow, width);

  // Set up keyboard handler
  state.keyHandler = (event: { key: string }) => {
    const key = event.key.toLowerCase();

    // Close on Escape or 'b'
    if ((keys.back as readonly string[]).includes(key)) {
      closeModal(parent, state);
      onClose?.();
      return;
    }

    // Scroll handling
    if ((keys.up as readonly string[]).includes(key)) {
      if (state.scrollOffset > 0) {
        state.scrollOffset--;
        updateContent(parent, state, startCol, startRow, width);
      }
      return;
    }

    if ((keys.down as readonly string[]).includes(key)) {
      const maxScroll = Math.max(
        0,
        state.contentLines.length - state.visibleLines,
      );
      if (state.scrollOffset < maxScroll) {
        state.scrollOffset++;
        updateContent(parent, state, startCol, startRow, width);
      }
      return;
    }

    // Check action keys
    for (const action of actions) {
      if (key === action.key.toLowerCase()) {
        closeModal(parent, state);
        action.action();
        return;
      }
    }

    // Close on Enter if no actions defined
    if (
      actions.length === 0 && (keys.select as readonly string[]).includes(key)
    ) {
      closeModal(parent, state);
      onClose?.();
    }
  };

  parent.on("keyPress", state.keyHandler);

  return {
    close: () => {
      closeModal(parent, state);
      onClose?.();
    },
    scrollUp: () => {
      if (state.scrollOffset > 0) {
        state.scrollOffset--;
        updateContent(parent, state, startCol, startRow, width);
      }
    },
    scrollDown: () => {
      const maxScroll = Math.max(
        0,
        state.contentLines.length - state.visibleLines,
      );
      if (state.scrollOffset < maxScroll) {
        state.scrollOffset++;
        updateContent(parent, state, startCol, startRow, width);
      }
    },
  };
}

/**
 * Draw the modal box frame
 */
function drawModalBox(
  parent: Tui,
  state: ModalState,
  col: number,
  row: number,
  width: number,
  height: number,
  title: string,
  actions: ModalAction[],
): void {
  const { box } = theme;
  const zIndex = 200; // Higher than notifications

  // Top border with title
  const titleText = ` ${title} `;
  const topPadding = Math.floor((width - 2 - titleText.length) / 2);
  const topLine = box.topLeft +
    box.horizontal.repeat(topPadding) +
    titleText +
    box.horizontal.repeat(width - 2 - topPadding - titleText.length) +
    box.topRight;

  state.components.push(
    new Text({
      parent,
      text: topLine,
      rectangle: { column: col, row, width },
      theme: { base: theme.header.border },
      zIndex,
    }),
  );

  // Side borders (content area will be drawn separately)
  for (let i = 1; i < height - 1; i++) {
    // Left border
    state.components.push(
      new Text({
        parent,
        text: box.vertical,
        rectangle: { column: col, row: row + i, width: 1 },
        theme: { base: theme.header.border },
        zIndex,
      }),
    );

    // Right border
    state.components.push(
      new Text({
        parent,
        text: box.vertical,
        rectangle: { column: col + width - 1, row: row + i, width: 1 },
        theme: { base: theme.header.border },
        zIndex,
      }),
    );

    // Background fill
    state.components.push(
      new Text({
        parent,
        text: " ".repeat(width - 2),
        rectangle: { column: col + 1, row: row + i, width: width - 2 },
        theme: { base: theme.bg.base },
        zIndex: zIndex - 1,
      }),
    );
  }

  // Bottom border with hints
  let hints = "[Esc] Close";
  if (state.contentLines.length > state.visibleLines) {
    hints = "[Up/Down] Scroll  " + hints;
  }
  for (const action of actions) {
    hints = `[${action.key.toUpperCase()}] ${action.label}  ` + hints;
  }

  const bottomPadding = Math.floor((width - 2 - hints.length) / 2);
  const bottomHints = hints.length < width - 2
    ? hints
    : hints.slice(0, width - 4);
  const bottomLine = box.bottomLeft +
    box.horizontal.repeat(Math.max(0, bottomPadding)) +
    bottomHints +
    box.horizontal.repeat(
      Math.max(0, width - 2 - bottomPadding - bottomHints.length),
    ) +
    box.bottomRight;

  state.components.push(
    new Text({
      parent,
      text: bottomLine,
      rectangle: { column: col, row: row + height - 1, width },
      theme: { base: theme.muted },
      zIndex,
    }),
  );
}

/**
 * Update the content display (for scrolling)
 */
function updateContent(
  parent: Tui,
  state: ModalState,
  col: number,
  row: number,
  width: number,
): void {
  const zIndex = 200;
  const contentCol = col + 2;
  const contentWidth = width - 4;
  const contentStartRow = row + 1;

  // Content components overlay existing ones on scroll
  // This works because we draw with higher z-index

  // Draw visible content lines
  const visibleContent = state.contentLines.slice(
    state.scrollOffset,
    state.scrollOffset + state.visibleLines,
  );

  for (let i = 0; i < state.visibleLines; i++) {
    const line = visibleContent[i] ?? "";
    const paddedLine = line.padEnd(contentWidth, " ");

    state.components.push(
      new Text({
        parent,
        text: paddedLine,
        rectangle: {
          column: contentCol,
          row: contentStartRow + i,
          width: contentWidth,
        },
        theme: { base: theme.text.normal },
        zIndex: zIndex + 1,
      }),
    );
  }

  // Scroll indicator
  if (state.contentLines.length > state.visibleLines) {
    const scrollPercent = state.scrollOffset /
      (state.contentLines.length - state.visibleLines);
    const indicatorRow = contentStartRow +
      Math.floor(scrollPercent * (state.visibleLines - 1));

    state.components.push(
      new Text({
        parent,
        text: "▓",
        rectangle: { column: col + width - 2, row: indicatorRow, width: 1 },
        theme: { base: theme.muted },
        zIndex: zIndex + 2,
      }),
    );
  }
}

/**
 * Close the modal and clean up
 */
function closeModal(parent: Tui, state: ModalState): void {
  // Remove keyboard handler
  if (state.keyHandler) {
    parent.off("keyPress", state.keyHandler);
    state.keyHandler = null;
  }

  // Destroy all components
  for (const component of state.components) {
    component.destroy();
  }
  state.components = [];
}

/**
 * Wrap text to fit within a given width
 */
function wrapText(text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  const paragraphs = text.split("\n");

  for (const paragraph of paragraphs) {
    if (paragraph.length === 0) {
      lines.push("");
      continue;
    }

    const words = paragraph.split(" ");
    let currentLine = "";

    for (const word of words) {
      if (currentLine.length === 0) {
        currentLine = word;
      } else if (currentLine.length + 1 + word.length <= maxWidth) {
        currentLine += " " + word;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }

    if (currentLine.length > 0) {
      lines.push(currentLine);
    }
  }

  return lines;
}

/**
 * Show a simple confirmation modal
 */
export function showConfirm(
  parent: Tui,
  title: string,
  message: string,
  onConfirm: () => void,
  onCancel?: () => void,
): ModalInstance {
  return showModal({
    parent,
    title,
    content: message,
    height: 8,
    actions: [
      { label: "Yes", key: "y", action: onConfirm },
      { label: "No", key: "n", action: onCancel ?? (() => {}) },
    ],
  });
}

/**
 * Show a text preview modal (for viewing files, YAML, etc.)
 */
export function showPreview(
  parent: Tui,
  title: string,
  content: string,
  onClose?: () => void,
): ModalInstance {
  return showModal({
    parent,
    title,
    content,
    width: 56,
    height: 18,
    onClose,
  });
}
