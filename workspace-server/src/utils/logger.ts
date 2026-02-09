/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * File-based debug logging utility. Disabled by default and activated via
 * the --debug CLI flag. Writes ISO-timestamped entries to logs/server.log
 * with a console fallback when file operations fail.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

import { PROJECT_ROOT } from "./paths";


const logFilePath = path.join(PROJECT_ROOT, "logs", "server.log");

let isLoggingEnabled = false;


async function ensureLogDirectoryExists() {
  try {
    await fs.mkdir(path.dirname(logFilePath), { recursive: true });
  } catch (error) {
    console.error("[cep] could not create log directory:", error);
  }
}

// Ensure the directory exists when the module is loaded.
ensureLogDirectoryExists();


/**
 * Enables or disables file logging globally.
 */
export function setLoggingEnabled(enabled: boolean) {
  isLoggingEnabled = enabled;
}


/**
 * Appends an ISO-timestamped message to the server log file. No-ops when
 * logging is disabled; falls back to console.error when the file write fails.
 */
export function logToFile(message: string) {
  if (!isLoggingEnabled) {
    return;
  }
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp} - ${message}\n`;

  fs.appendFile(logFilePath, logMessage).catch((err) => {
    console.error("[cep] failed to write to log file:", err);
  });
}
