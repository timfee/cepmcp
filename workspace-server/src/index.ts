#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Entry point for the Chrome Enterprise Premium MCP Server. Initializes the
 * MCP server, registers authentication tools, and starts listening over stdio.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { version } from "../package.json";
import { AuthManager } from "./auth/AuthManager";
import { SCOPES } from "./constants";
import { setLoggingEnabled } from "./utils/logger";
import { applyToolNameNormalization } from "./utils/tool-normalization";


/**
 * Bootstraps the MCP server, wires up authentication, registers tools,
 * and begins listening for incoming requests on stdio.
 */
async function main() {
  if (process.argv.includes("--debug")) {
    setLoggingEnabled(true);
  }

  const authManager = new AuthManager([...SCOPES]);

  const server = new McpServer({
    name: "google-cep-server",
    version,
  });

  authManager.setOnStatusUpdate((message) => {
    server
      .sendLoggingMessage({
        level: "info",
        data: message,
      })
      .catch((err) => {
        console.error("[cep] failed to send logging message:", err);
      });
  });

  const useDotNames = process.argv.includes("--use-dot-names");
  const separator = useDotNames ? "." : "_";
  applyToolNameNormalization(server, useDotNames);

  server.registerTool(
    "auth.clear",
    {
      description:
        "Clears the authentication credentials, forcing a re-login on the next request.",
      inputSchema: {},
    },
    async () => {
      await authManager.clearAuth();
      return {
        content: [
          {
            type: "text",
            text: "Authentication credentials cleared. You will be prompted to log in again on the next request.",
          },
        ],
      };
    }
  );

  server.registerTool(
    "auth.refreshToken",
    {
      description: "Manually triggers the token refresh process.",
      inputSchema: {},
    },
    async () => {
      await authManager.refreshToken();
      return {
        content: [
          {
            type: "text",
            text: "Token refresh process triggered successfully.",
          },
        ],
      };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(
    `[cep] server running (tool separator: "${separator}"), listening for requests...`
  );
}


main().catch((error) => {
  console.error("[cep] critical error:", error);
  process.exit(1);
});
