/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Separate esbuild configuration for the auth-utils bundle. Produces a
 * standalone CommonJS module from oauth-credential-storage.ts, with keytar
 * excluded as an external native dependency.
 */

import * as esbuild from "esbuild";


/**
 * Bundles the credential storage API into dist/auth-utils.js for use
 * outside the main server bundle.
 */
async function buildAuthUtils() {
  try {
    await esbuild.build({
      entryPoints: ["src/auth/token-storage/oauth-credential-storage.ts"],
      bundle: true,
      platform: "node",
      target: "node20",
      outfile: "dist/auth-utils.js",
      minify: true,
      sourcemap: true,
      external: [
        "keytar",
      ],
      format: "cjs",
      logLevel: "info",
    });

    console.log("Auth Utils build completed successfully!");
  } catch (error) {
    console.error("Auth Utils build failed:", error);
    process.exit(1);
  }
}


buildAuthUtils();
