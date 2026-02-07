/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Main esbuild configuration for the workspace MCP server. Bundles
 * src/index.ts into a single minified CommonJS file targeting Node 16+,
 * with the 'open' package aliased to our secure browser launcher wrapper.
 */

import * as esbuild from "esbuild";
import path from "node:path";


/**
 * Runs the esbuild bundler with production settings and exits on failure.
 */
async function build() {
  try {
    await esbuild.build({
      entryPoints: ["src/index.ts"],
      bundle: true,
      platform: "node",
      target: "node16",
      outfile: "dist/index.js",
      minify: true,
      sourcemap: true,
      alias: {
        open: path.resolve(__dirname, "src/utils/open-wrapper.ts"),
      },
      external: ["jsdom"],
      loader: {
        ".node": "file",
      },
      format: "cjs",
      logLevel: "info",
    });

    console.log("Build completed successfully!");
  } catch (error) {
    console.error("Build failed:", error);
    process.exit(1);
  }
}


build();
