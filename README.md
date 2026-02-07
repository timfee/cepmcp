# CEP MCP Server

Chrome Enterprise Premium (CEP) Model Context Protocol server. Provides authenticated access to Chrome Management, Cloud Identity, Admin Directory, eDiscovery, and Audit APIs through the MCP standard.

## Architecture

```
cepmcp/
  workspace-server/        Main MCP server package
    src/
      constants.ts          Shared configuration (URLs, scopes, keys)
      index.ts              Entry point: MCP server setup and tool registration
      auth/
        AuthManager.ts      OAuth 2.0 lifecycle (login, refresh, cache)
        token-storage/      Credential persistence layer
          types.ts           Storage interfaces and token shapes
          base-token-storage.ts   Abstract base with validation
          hybrid-token-storage.ts Keychain-first, file fallback selector
          keychain-token-storage.ts  macOS/Linux OS keychain backend
          file-token-storage.ts      AES-256-GCM encrypted file backend
          oauth-credential-storage.ts  Google Credentials <-> internal format bridge
      utils/
        logger.ts           File-based debug logging (--debug flag)
        paths.ts            Project root detection and well-known paths
        type-guards.ts      TypeScript narrowing helpers
        secure-browser-launcher.ts   Injection-safe browser opening
        open-wrapper.ts     Drop-in 'open' package replacement
        tool-normalization.ts  Dot-to-underscore tool name mapping
  scripts/                 Build and release tooling
  cloud_function/          Cloud Run OAuth token exchange endpoint
```

## Prerequisites

- Node.js 18+
- npm 7+ (workspaces support)

## Development Setup

```bash
# Install dependencies
npm install

# Start the server in development mode
npm start

# Start with debug logging
npm start -- --debug

# Build the production bundle
npm run build
```

### Gemini Extensions

To install as a Gemini extension for local development:

```bash
gemini extensions link .
```

This registers the extension using the `gemini-extension.json` manifest at the project root.

## Available Tools

The MCP server exposes two authentication management tools:

| Tool | Description |
|------|-------------|
| `auth.clear` / `auth_clear` | Clears cached credentials, forcing re-login |
| `auth.refreshToken` / `auth_refresh_token` | Manually triggers token refresh |

Tool names use underscores by default. Pass `--use-dot-names` to preserve dot notation.

## Authentication Flow

1. On first request, the server opens a browser for Google OAuth consent
2. The OAuth callback goes through a Cloud Run function that holds the client secret
3. Tokens are stored locally via OS keychain (preferred) or encrypted file (fallback)
4. Access tokens are refreshed proactively 5 minutes before expiry

Force file-based storage by setting `GEMINI_CLI_WORKSPACE_FORCE_FILE_STORAGE=true`.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Bundle workspace-server with esbuild |
| `npm start` | Run the MCP server via tsx |
| `npm run release` | Build a distributable tar.gz archive |
| `npm run set-version [version]` | Sync version across package.json files |
| `tsx scripts/auth-utils.ts status` | Show current auth status |
| `tsx scripts/auth-utils.ts clear` | Clear stored credentials |
| `tsx scripts/auth-utils.ts expire` | Force-expire the access token (for testing) |
| `tsx scripts/list-deps.ts <pkg>` | List transitive dependencies |

## License

Apache-2.0
