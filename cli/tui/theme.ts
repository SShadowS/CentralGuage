/**
 * TUI Theme - Consistent styling for CentralGauge TUI
 */
import { crayon } from "crayon";

// Gray color helper (crayon uses lightBlack for gray)
const gray = crayon.lightBlack;

export const theme = {
  // App colors
  primary: crayon.cyan,
  secondary: crayon.blue,
  success: crayon.green,
  warning: crayon.yellow,
  error: crayon.red,
  muted: gray,

  // Background styles
  bg: {
    base: crayon.bgBlack,
    focused: crayon.bgBlue,
    active: crayon.bgCyan,
    selected: crayon.bgGreen,
  },

  // Text styles
  text: {
    normal: crayon.white,
    bold: crayon.white.bold,
    dim: gray,
    highlight: crayon.cyan.bold,
  },

  // Component themes for deno_tui
  button: {
    base: crayon.bgBlack.white,
    focused: crayon.bgBlue.white.bold,
    active: crayon.bgCyan.black,
    disabled: crayon.bgBlack.lightBlack,
  },

  menuItem: {
    base: crayon.bgBlack.white,
    focused: crayon.bgBlue.white.bold,
    active: crayon.bgCyan.black,
  },

  header: {
    border: crayon.cyan,
    title: crayon.cyan.bold,
    subtitle: gray,
  },

  statusBar: {
    base: crayon.bgBlack.lightBlack,
    running: crayon.green,
    stopped: crayon.red,
    warning: crayon.yellow,
  },

  // Box drawing characters
  box: {
    topLeft: "╭",
    topRight: "╮",
    bottomLeft: "╰",
    bottomRight: "╯",
    horizontal: "─",
    vertical: "│",
  },
} as const;

// Layout constants
export const layout = {
  headerHeight: 4,
  statusBarHeight: 2,
  padding: 2,
  menuWidth: 40,
  screenWidth: 60,
} as const;

// Keybindings
export const keys = {
  quit: ["q", "Q"],
  back: ["b", "B", "escape"],
  select: ["enter", "return"],
  up: ["up", "k"],
  down: ["down", "j"],
  left: ["left", "h"],
  right: ["right", "l"],
} as const;
