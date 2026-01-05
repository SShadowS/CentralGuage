/**
 * Cross-platform clipboard utility
 * Supports Windows, macOS, and Linux
 */

import { Logger } from "../logger/mod.ts";

const log = Logger.create("utils:clipboard");

/**
 * Copy text to system clipboard
 * @param text Text to copy
 * @returns true if successful, false otherwise
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  const os = Deno.build.os;

  try {
    let cmd: string[];
    const stdin: "piped" | "null" = "piped";

    switch (os) {
      case "windows":
        // Windows: use clip.exe
        cmd = ["cmd", "/c", "clip"];
        break;

      case "darwin":
        // macOS: use pbcopy
        cmd = ["pbcopy"];
        break;

      case "linux":
      case "freebsd":
      case "netbsd":
      case "solaris":
      case "illumos":
      case "aix":
      case "android":
        // Linux/Unix: try xclip first, then xsel
        if (await commandExists("xclip")) {
          cmd = ["xclip", "-selection", "clipboard"];
        } else if (await commandExists("xsel")) {
          cmd = ["xsel", "--clipboard", "--input"];
        } else {
          log.warn("No clipboard utility found (install xclip or xsel)");
          return false;
        }
        break;

      default:
        log.warn("Clipboard not supported on platform", { os });
        return false;
    }

    const cmdPath = cmd[0];
    if (!cmdPath) {
      log.warn("No clipboard command configured");
      return false;
    }

    const command = new Deno.Command(cmdPath, {
      args: cmd.slice(1),
      stdin,
      stdout: "null",
      stderr: "null",
    });

    const process = command.spawn();

    // Write text to stdin
    const writer = process.stdin.getWriter();
    await writer.write(new TextEncoder().encode(text));
    await writer.close();

    const status = await process.status;
    return status.success;
  } catch (error) {
    log.warn("Clipboard copy failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Check if a command exists on the system
 */
async function commandExists(command: string): Promise<boolean> {
  try {
    const which = Deno.build.os === "windows" ? "where" : "which";
    const cmd = new Deno.Command(which, {
      args: [command],
      stdout: "null",
      stderr: "null",
    });
    const status = await cmd.output();
    return status.success;
  } catch {
    return false;
  }
}
