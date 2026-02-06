import "dotenv/config";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import {
  mcpAuthMetadataRouter,
  getOAuthProtectedResourceMetadataUrl,
} from "@modelcontextprotocol/sdk/server/auth/router.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { OAuthMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";
import cors from "cors";
import express, { Request, Response, NextFunction } from "express";
import { z } from "zod";

// --- CONFIGURATION ---
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "localhost";
const AUTH_HOST = process.env.AUTH_HOST || "localhost";
const AUTH_PORT = Number(process.env.AUTH_PORT) || 8080;
const AUTH_REALM = process.env.AUTH_REALM || "master";

// Placeholder for Keycloak/OIDC provider URLs
// In production, replace these with your actual identity provider's endpoints
const createOAuthUrls = () => {
  const baseAuthUrl = `http://${AUTH_HOST}:${AUTH_PORT}/realms/${AUTH_REALM}/protocol/openid-connect`;
  return {
    issuer: `http://${AUTH_HOST}:${AUTH_PORT}/realms/${AUTH_REALM}`,
    introspection_endpoint: `${baseAuthUrl}/token/introspect`,
    authorization_endpoint: `${baseAuthUrl}/auth`,
    token_endpoint: `${baseAuthUrl}/token`,
    jwks_uri: `${baseAuthUrl}/certs`,
  };
};

const app = express();
app.use(cors());
app.use(express.json());

// --- MCP SERVER SETUP ---
const server = new McpServer({
  name: "auth-demo-server",
  version: "1.0.0",
});

// Register a protected tool
server.tool("secure_echo", { message: z.string() }, async ({ message }) => ({
  content: [
    {
      type: "text",
      text: `Securely echoed: ${message}`,
    },
  ],
}));

// --- AUTHENTICATION MIDDLEWARE ---
const mcpServerUrl = new URL(`http://${HOST}:${PORT}`);
const oauthUrls = createOAuthUrls();

const oauthMetadata: OAuthMetadata = {
  ...oauthUrls,
  response_types_supported: ["code"],
  scopes_supported: ["mcp:tools"], // Scope required to access tools
  grant_types_supported: ["authorization_code", "refresh_token"],
  token_endpoint_auth_methods_supported: ["client_secret_post"],
};

// Token verifier implementation
// In production, validate the token signature, expiration, and audience against your provider
const tokenVerifier = {
  verifyAccessToken: async (token: string) => {
    console.log(`Verifying token: ${token.substring(0, 10)}...`);

    // MOCK VERIFICATION for boilerplate purposes
    // Implement real introspection or JWT verification here
    // Example:
    // const response = await fetch(oauthMetadata.introspection_endpoint!, {
    //   method: "POST",
    //   headers: { "Content-Type": "application/x-www-form-urlencoded" },
    //   body: new URLSearchParams({ token, client_id: process.env.OAUTH_CLIENT_ID!, client_secret: process.env.OAUTH_CLIENT_SECRET! })
    // });
    // const data = await response.json();
    // if (!data.active) throw new Error("Token inactive");

    // For now, accept any token that starts with "mcp_" or "test"
    if (!token.startsWith("mcp_") && !token.startsWith("test")) {
      // throw new Error("Invalid token format");
    }

    return {
      active: true,
      scope: "mcp:tools", // create mock scope
      aud: [mcpServerUrl.origin],
      client_id: "mcp-client",
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    };
  },
};

// Metadata endpoint for clients to discover auth requirements
app.use(
  mcpAuthMetadataRouter({
    oauthMetadata,
    resourceServerUrl: mcpServerUrl,
    scopesSupported: ["mcp:tools"],
    resourceName: "MCP Auth Demo Server",
  })
);

// Middleware to enforce authentication
const authMiddleware = requireBearerAuth({
  verifier: tokenVerifier,
  requiredScopes: ["mcp:tools"],
  resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpServerUrl),
});

// Helper for async handlers
const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    // eslint-disable-next-line promise/no-callback-in-promise
    Promise.resolve(fn(req, res, next)).catch((err) => next(err));
  };

// --- ROUTES ---

// Store active transports
const transports = new Map<string, SSEServerTransport>();

// SSE Endpoint for MCP connection (protected)
app.get(
  "/sse",
  authMiddleware,
  asyncHandler(async (req, res) => {
    console.log("New SSE connection authenticated");

    // Create transport
    const transport = new SSEServerTransport("/messages", res);
    const sessionId = transport.sessionId;

    // Store transport
    transports.set(sessionId, transport);

    // Cleanup on close
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, unicorn/prefer-add-event-listener
    (transport as any).onclose = () => {
      console.log(`Session closed: ${sessionId}`);
      transports.delete(sessionId);
    };

    await server.connect(transport);
  })
);

// POST Endpoint for MCP messages (protected)
app.post(
  "/messages",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const sessionId = req.query.sessionId as string;
    const transport = transports.get(sessionId);

    if (!transport) {
      res.status(404).send("Session not found");
      return;
    }

    // Handle the message
    await transport.handlePostMessage(req, res);
  })
);

app.listen(PORT, HOST, () => {
  console.log(`🚀 MCP Server running on ${mcpServerUrl.origin}`);
  console.log(
    `👉 Auth Metadata: ${mcpServerUrl.origin}/.well-known/oauth-protected-resource`
  );
  console.log(
    `👉 Auth Check: curl -H "Authorization: Bearer test_token" ${mcpServerUrl.origin}/sse`
  );
});
