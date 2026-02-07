/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Project root detection and well-known file paths. Walks up the directory
 * tree from the current module to locate gemini-extension.json, then derives
 * absolute paths for the encrypted token file and master encryption key.
 */

import * as fs from "node:fs";
import path from "node:path";


/**
 * Traverses parent directories from __dirname until it finds one containing
 * gemini-extension.json, which marks the project root.
 */
function findProjectRoot(): string {
  let dir = __dirname;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, "gemini-extension.json"))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  throw new Error(
    `Could not find project root containing gemini-extension.json. Traversed up from ${__dirname}.`
  );
}


/**
 * Absolute path to the project root directory.
 */
export const PROJECT_ROOT = findProjectRoot();


/**
 * Absolute path to the AES-256-GCM encrypted token file.
 */
export const ENCRYPTED_TOKEN_PATH = path.join(
  PROJECT_ROOT,
  "gemini-cli-workspace-token.json"
);


/**
 * Absolute path to the master encryption key used by FileTokenStorage.
 */
export const ENCRYPTION_MASTER_KEY_PATH = path.join(
  PROJECT_ROOT,
  ".gemini-cli-workspace-master-key"
);
