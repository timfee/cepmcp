/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Secure browser launching utilities that prevent command injection. Uses
 * execFile (not exec) with validated HTTP/HTTPS URLs and platform-specific
 * commands. Falls back through multiple openers on Linux when xdg-open fails.
 */

import type { ExecFileOptions } from "node:child_process";

import { execFile } from "node:child_process";
import { platform } from "node:os";
import { URL } from "node:url";


function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  const timeout = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("Timeout")), ms);
  });
  return Promise.race([promise, timeout]).finally(() =>
    clearTimeout(timeoutId)
  );
}


/**
 * Validates that a URL uses only HTTP or HTTPS and contains no control
 * characters, preventing shell injection through crafted URLs.
 */
function validateUrl(url: string): void {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("Invalid URL");
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error(
      `Unsafe protocol: ${parsedUrl.protocol}. Only HTTP and HTTPS are allowed.`
    );
  }

  // oxlint-disable-next-line no-control-regex
  if (/[\r\n\u0000-\u001f]/.test(url)) {
    throw new Error("URL contains invalid characters");
  }
}


/**
 * Opens a URL in the default browser using platform-specific commands.
 * Avoids shell injection by validating URLs, using execFile instead of
 * exec, and passing URLs as arguments rather than command strings. On
 * Linux/BSD, tries xdg-open first then falls back to alternative openers.
 */
export async function openBrowserSecurely(
  url: string,
  execFileFn: typeof execFile = execFile
): Promise<void> {
  validateUrl(url);

  const platformName = platform();
  let command: string;
  let args: string[];

  switch (platformName) {
    case "darwin":
      command = "open";
      args = [url];
      break;

    case "win32":
      // PowerShell avoids the cmd.exe shell which is vulnerable to injection
      command = "powershell.exe";
      args = [
        "-NoProfile",
        "-NonInteractive",
        "-WindowStyle",
        "Hidden",
        "-Command",
        `Start-Process '${url.replace(/'/g, "''")}'`,
      ];
      break;

    case "linux":
    case "freebsd":
    case "openbsd":
      command = "xdg-open";
      args = [url];
      break;

    default:
      throw new Error(`Unsupported platform: ${platformName}`);
  }

  const options: Record<string, unknown> = {
    env: {
      ...process.env,
      SHELL: undefined,
    },
    detached: true,
    stdio: "ignore",
  };

  const tryCommand = (cmd: string, cmdArgs: string[]): Promise<void> =>
    new Promise((resolve, reject) => {
      const child = execFileFn(
        cmd,
        cmdArgs,
        options as ExecFileOptions,
        (error) => {
          if (error) {
            reject(error);
          }
        }
      );

      child.on("error", (error) => {
        reject(error);
      });

      child.on("exit", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Process exited with code ${code}`));
        }
      });
    });

  try {
    await withTimeout(tryCommand(command, args), 5000);
  } catch (error) {
    if (
      (platformName === "linux" ||
        platformName === "freebsd" ||
        platformName === "openbsd") &&
      command === "xdg-open"
    ) {
      const fallbackCommands = [
        "gnome-open",
        "kde-open",
        "firefox",
        "chromium",
        "google-chrome",
      ];

      for (const fallbackCommand of fallbackCommands) {
        try {
          await withTimeout(tryCommand(fallbackCommand, [url]), 5000);
          return;
        } catch {
          continue;
        }
      }
    }

    throw new Error(
      `Failed to open browser: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
      { cause: error }
    );
  }
}


/**
 * Detects whether the current environment has a GUI capable of displaying
 * a browser. Returns false in CI, headless SSH sessions, and environments
 * without a display server.
 */
export function shouldLaunchBrowser(): boolean {
  const browserBlocklist = ["www-browser"];
  const browserEnv = process.env.BROWSER;
  if (browserEnv && browserBlocklist.includes(browserEnv)) {
    return false;
  }

  if (process.env.CI || process.env.DEBIAN_FRONTEND === "noninteractive") {
    return false;
  }

  const isSSH = !!process.env.SSH_CONNECTION;

  if (platform() === "linux") {
    const displayVariables = ["DISPLAY", "WAYLAND_DISPLAY", "MIR_SOCKET"];
    const hasDisplay = displayVariables.some((v) => !!process.env[v]);
    if (!hasDisplay) {
      return false;
    }
  }

  if (isSSH && platform() !== "linux") {
    return false;
  }

  return true;
}
