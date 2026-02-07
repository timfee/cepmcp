#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// Dynamically import version from package.json
import { version } from "../package.json";
import { AuthManager } from "./auth/AuthManager";
import { setLoggingEnabled } from "./utils/logger";
import { applyToolNameNormalization } from "./utils/tool-normalization";

const SCOPES = [
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/chat.spaces",
  "https://www.googleapis.com/auth/chat.messages",
  "https://www.googleapis.com/auth/chat.memberships",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/directory.readonly",
  "https://www.googleapis.com/auth/presentations.readonly",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
];

async function main() {
  if (process.argv.includes("--debug")) {
    setLoggingEnabled(true);
  }

  const authManager = new AuthManager(SCOPES);

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
        console.error("Failed to send logging message:", err);
      });
  });

  // 3. Register tools directly on the server
  // Handle tool name normalization (dots to underscores) by default, or use dots if --use-dot-names is passed.
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

  // 4. Connect the transport layer and start listening
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(
    `Google Workspace MCP Server is running (using ${separator} for tool names). Listening for requests...`
  );
}

main().catch((error) => {
  console.error("A critical error occurred:", error);
  process.exit(1);
});
