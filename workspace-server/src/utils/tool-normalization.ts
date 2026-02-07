/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * MCP tool name normalization. Monkey-patches McpServer.registerTool to
 * convert dot-separated tool names (e.g. "auth.clear") into underscore-
 * separated names (e.g. "auth_clear") for clients that do not support dots.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";


/**
 * Wraps the McpServer.registerTool method so that dots in tool names are
 * replaced with the chosen separator. Pass useDotNames=true to preserve
 * the original dot notation.
 */
export function applyToolNameNormalization(
  server: McpServer,
  useDotNames: boolean
): void {
  const separator = useDotNames ? "." : "_";
  const originalRegisterTool = server.registerTool.bind(server);

  (
    server as unknown as {
      registerTool: (name: string, ...args: unknown[]) => unknown;
    }
  ).registerTool = (name: string, ...rest: unknown[]) => {
    const normalizedName = name.replace(/\./g, separator);
    return (originalRegisterTool as (...args: unknown[]) => unknown)(
      normalizedName,
      ...rest
    );
  };
}
