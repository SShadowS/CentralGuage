/**
 * Header Component - App title and branding
 */
import { Text } from "tui/components";
import type { Tui } from "tui";
import { layout, theme } from "../theme.ts";

export interface HeaderOptions {
  parent: Tui;
  title?: string;
  subtitle?: string;
  version?: string;
}

export function createHeader(options: HeaderOptions): void {
  const {
    parent,
    title = "CentralGauge",
    subtitle = "AL Code Generation Benchmark",
    version = "v0.1.0",
  } = options;

  const width = layout.screenWidth;
  const col = layout.padding;

  // Top border
  new Text({
    parent,
    text: `${theme.box.topLeft}${
      theme.box.horizontal.repeat(width - 2)
    }${theme.box.topRight}`,
    rectangle: { column: col, row: 1, width },
    theme: { base: theme.header.border },
    zIndex: 0,
  });

  // Title line
  const titleText = `${title} ${version}`;
  const titlePadding = Math.floor((width - 2 - titleText.length) / 2);
  new Text({
    parent,
    text: `${theme.box.vertical}${" ".repeat(titlePadding)}${titleText}${
      " ".repeat(width - 2 - titlePadding - titleText.length)
    }${theme.box.vertical}`,
    rectangle: { column: col, row: 2, width },
    theme: { base: theme.header.title },
    zIndex: 0,
  });

  // Subtitle line
  const subPadding = Math.floor((width - 2 - subtitle.length) / 2);
  new Text({
    parent,
    text: `${theme.box.vertical}${" ".repeat(subPadding)}${subtitle}${
      " ".repeat(width - 2 - subPadding - subtitle.length)
    }${theme.box.vertical}`,
    rectangle: { column: col, row: 3, width },
    theme: { base: theme.header.subtitle },
    zIndex: 0,
  });

  // Bottom border
  new Text({
    parent,
    text: `${theme.box.bottomLeft}${
      theme.box.horizontal.repeat(width - 2)
    }${theme.box.bottomRight}`,
    rectangle: { column: col, row: 4, width },
    theme: { base: theme.header.border },
    zIndex: 0,
  });
}
