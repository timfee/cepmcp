/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * OAuth 2.0 authentication manager for Google Workspace APIs. Handles the full
 * lifecycle of OAuth credentials: loading from storage, browser-based login,
 * proactive token refresh via a cloud function, and credential persistence.
 */

import { google, Auth } from "googleapis";
import crypto from "node:crypto";
import * as http from "node:http";
import * as net from "node:net";
import * as url from "node:url";

import {
  AUTH_TIMEOUT_MS,
  CLIENT_ID,
  CLOUD_FUNCTION_URL,
  TOKEN_EXPIRY_BUFFER_MS,
} from "../constants";
import { logToFile } from "../utils/logger";
import open from "../utils/open-wrapper";
import { shouldLaunchBrowser } from "../utils/secure-browser-launcher";
import {
  clearCredentials,
  loadCredentials,
  saveCredentials,
} from "./token-storage/oauth-credential-storage";


/**
 * An authentication URL paired with a promise that resolves once the user
 * completes the browser-based OAuth flow (or rejects on failure).
 */
interface OauthWebLogin {
  authUrl: string;
  loginCompletePromise: Promise<void>;
}


/**
 * Orchestrates OAuth 2.0 authentication against Google APIs. Caches the
 * authenticated client in memory, refreshes tokens proactively before expiry,
 * and falls back to a full browser-based login when no valid token exists.
 */
export class AuthManager {
  private client: Auth.OAuth2Client | null = null;
  private scopes: string[];
  private onStatusUpdate: ((message: string) => void) | null = null;

  constructor(scopes: string[]) {
    this.scopes = scopes;
  }

  /**
   * Registers a callback invoked whenever the authentication status changes,
   * allowing the caller to forward messages to the MCP logging channel.
   */
  public setOnStatusUpdate(callback: (message: string) => void) {
    this.onStatusUpdate = callback;
  }

  /**
   * Returns true when the token is expired or will expire within the
   * buffer window, signaling that a proactive refresh is needed.
   */
  private static isTokenExpiringSoon(credentials: Auth.Credentials): boolean {
    return !!(
      credentials.expiry_date &&
      credentials.expiry_date < Date.now() + TOKEN_EXPIRY_BUFFER_MS
    );
  }

  /**
   * Attempts to refresh an expiring token and clears the client on failure
   * so the caller falls through to re-authentication.
   */
  private async tryProactiveRefresh(): Promise<void> {
    try {
      await this.refreshToken();
      logToFile("[auth] token refreshed successfully");
    } catch (error) {
      logToFile(`[auth] refresh failed, clearing client: ${error}`);
      this.client = null;
      await clearCredentials();
    }
  }

  /**
   * Attempts to restore credentials from persistent storage into the given
   * OAuth2 client. Returns false and clears storage when required scopes are
   * missing from the cached token.
   */
  private async loadCachedCredentials(
    client: Auth.OAuth2Client
  ): Promise<boolean> {
    const credentials = await loadCredentials();
    if (!credentials) {
      return false;
    }

    const savedScopes = new Set(credentials.scope?.split(" ") ?? []);
    logToFile(`[auth] cached scopes: ${[...savedScopes].join(", ")}`);
    logToFile(`[auth] required scopes: ${this.scopes.join(", ")}`);

    const missingScopes = this.scopes.filter(
      (scope) => !savedScopes.has(scope)
    );

    if (missingScopes.length > 0) {
      logToFile(`[auth] missing scopes: ${missingScopes.join(", ")}`);
      await clearCredentials();
      return false;
    }

    client.setCredentials(credentials);
    return true;
  }

  /**
   * Returns an authenticated OAuth2 client, reusing a cached client when
   * possible. If the cached token is expired it refreshes proactively; if no
   * valid token exists it initiates a browser-based OAuth login flow.
   */
  public async getAuthenticatedClient(): Promise<Auth.OAuth2Client> {
    logToFile("[auth] getAuthenticatedClient called");

    const hasCachedClient =
      this.client?.credentials?.refresh_token != null;

    if (hasCachedClient) {
      logToFile("[auth] found cached client with refresh token");

      if (AuthManager.isTokenExpiringSoon(this.client!.credentials)) {
        await this.tryProactiveRefresh();
      }

      if (this.client) {
        return this.client;
      }
    }

    // The client secret is only known by the cloud function
    const oAuth2Client = new google.auth.OAuth2({ clientId: CLIENT_ID });

    oAuth2Client.on("tokens", async (tokens: Auth.Credentials) => {
      logToFile("[auth] tokens event received");
      try {
        const current = (await loadCredentials()) || {};
        const merged = {
          ...tokens,
          refresh_token: tokens.refresh_token || current.refresh_token,
        };
        await saveCredentials(merged);
        logToFile("[auth] credentials saved after token event");
      } catch (e) {
        logToFile(`[auth] error saving refreshed credentials: ${e}`);
      }
    });

    logToFile("[auth] checking saved credentials...");
    if (await this.loadCachedCredentials(oAuth2Client)) {
      this.client = oAuth2Client;

      if (AuthManager.isTokenExpiringSoon(this.client.credentials)) {
        await this.tryProactiveRefresh();
      }

      if (this.client) {
        return this.client;
      }
    }

    const webLogin = await this.authWithWeb(oAuth2Client);
    await open(webLogin.authUrl);

    const msg = "Waiting for authentication... Check your browser.";
    logToFile(`[auth] ${msg}`);
    this.onStatusUpdate?.(msg);

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(
            "Authentication timed out. The user did not complete the login process in the browser. " +
              "Please ask the user to check their browser and try again."
          )
        );
      }, AUTH_TIMEOUT_MS);
    });
    await Promise.race([webLogin.loginCompletePromise, timeoutPromise]);

    await saveCredentials(oAuth2Client.credentials);
    this.client = oAuth2Client;
    return this.client;
  }

  /**
   * Clears all cached credentials from both memory and persistent storage,
   * forcing a fresh login on the next authentication attempt.
   */
  public async clearAuth(): Promise<void> {
    logToFile("[auth] clearing credentials");
    this.client = null;
    await clearCredentials();
  }

  /**
   * Refreshes the access token by calling the cloud function endpoint, which
   * holds the client secret needed for token exchange. Preserves the existing
   * refresh token since Google does not issue a new one on refresh.
   */
  public async refreshToken(): Promise<void> {
    logToFile("[auth] refresh triggered");

    if (!this.client) {
      this.client = await this.getAuthenticatedClient();
    }

    const currentCredentials = { ...this.client.credentials };
    if (!currentCredentials.refresh_token) {
      throw new Error("No refresh token available");
    }

    const response = await fetch(
      `${CLOUD_FUNCTION_URL}/refreshToken`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          refresh_token: currentCredentials.refresh_token,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Token refresh failed: ${response.status} ${errorText}`
      );
    }

    const newTokens = (await response.json()) as Auth.Credentials;
    const mergedCredentials = {
      ...newTokens,
      refresh_token: currentCredentials.refresh_token,
    };

    this.client.setCredentials(mergedCredentials);
    await saveCredentials(mergedCredentials);
    logToFile("[auth] token refreshed via cloud function");
  }

  /**
   * Finds an available TCP port for the local OAuth callback server. Respects
   * the OAUTH_CALLBACK_PORT environment variable when set.
   */
  private static async getAvailablePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const portStr = process.env["OAUTH_CALLBACK_PORT"];
      if (portStr) {
        const port = Number.parseInt(portStr, 10);
        if (Number.isNaN(port) || port <= 0 || port > 65535) {
          return reject(
            new Error(`Invalid OAUTH_CALLBACK_PORT: "${portStr}"`)
          );
        }
        return resolve(port);
      }

      let port = 0;
      const server = net.createServer();
      server.listen(0, () => {
        const address = server.address() as net.AddressInfo;
        port = address?.port;
      });
      server.on("listening", () => {
        server.close();
        server.unref();
      });
      server.on("error", (e) => reject(e));
      server.on("close", () => resolve(port));
    });
  }

  /**
   * Starts a local HTTP server to receive the OAuth callback, generates a
   * CSRF-protected authorization URL, and returns both the URL and a promise
   * that resolves when the user completes the login flow in the browser.
   */
  private async authWithWeb(client: Auth.OAuth2Client): Promise<OauthWebLogin> {
    logToFile(`[auth] requesting auth with scopes: ${this.scopes.join(", ")}`);

    const port = await AuthManager.getAvailablePort();
    const host = process.env["OAUTH_CALLBACK_HOST"] || "localhost";
    const localRedirectUri = `http://${host}:${port}/oauth2callback`;
    const isGuiAvailable = shouldLaunchBrowser();
    const csrfToken = crypto.randomBytes(32).toString("hex");

    const statePayload = {
      uri: isGuiAvailable ? localRedirectUri : undefined,
      manual: !isGuiAvailable,
      csrf: csrfToken,
    };
    const state = Buffer.from(JSON.stringify(statePayload)).toString("base64");

    const authUrl = client.generateAuthUrl({
      redirect_uri: CLOUD_FUNCTION_URL,
      access_type: "offline",
      scope: this.scopes,
      state,
      prompt: "consent",
    });

    const loginCompletePromise = new Promise<void>((resolve, reject) => {
      const server = http.createServer(async (req, res) => {
        try {
          if (!req.url?.startsWith("/oauth2callback")) {
            res.end();
            reject(new Error(`Unexpected request: ${req.url}`));
            return;
          }

          const qs = new url.URL(req.url, `http://${host}:${port}`)
            .searchParams;

          const returnedState = qs.get("state");
          if (returnedState !== csrfToken) {
            res.writeHead(403, { "Content-Type": "text/html" });
            res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Authentication Failed</title>
  <style>
    body { font-family: "Google Sans", Roboto, Arial, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f8f9fa; color: #202124; }
    .card { background: #fff; border-radius: 8px; box-shadow: 0 1px 3px rgba(60,64,67,.3); padding: 48px; text-align: center; max-width: 400px; }
    .icon { color: #d93025; font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 22px; font-weight: 400; margin: 0 0 8px; }
    p { font-size: 14px; color: #5f6368; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">&#x2717;</div>
    <h1>Authentication failed</h1>
    <p>State mismatch detected. Please try again.</p>
  </div>
</body>
</html>`);
            reject(new Error("OAuth state mismatch. Possible CSRF attack."));
            return;
          }

          const oauthError = qs.get("error");
          if (oauthError) {
            const description =
              qs.get("error_description") || "No additional details";
            res.end();
            reject(new Error(`Google OAuth error: ${oauthError}. ${description}`));
            return;
          }

          const access_token = qs.get("access_token");
          const expiry_date_str = qs.get("expiry_date");

          if (!access_token || !expiry_date_str) {
            reject(new Error("Authentication failed: did not receive tokens from callback."));
            return;
          }

          const tokens: Auth.Credentials = {
            access_token,
            refresh_token: qs.get("refresh_token") || null,
            scope: qs.get("scope") || undefined,
            token_type: qs.get("token_type") === "Bearer" ? "Bearer" : undefined,
            expiry_date: Number.parseInt(expiry_date_str, 10),
          };
          client.setCredentials(tokens);
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Authentication Complete</title>
  <style>
    body { font-family: "Google Sans", Roboto, Arial, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f8f9fa; color: #202124; }
    .card { background: #fff; border-radius: 8px; box-shadow: 0 1px 3px rgba(60,64,67,.3); padding: 48px; text-align: center; max-width: 400px; }
    .icon { color: #1a73e8; font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 22px; font-weight: 400; margin: 0 0 8px; }
    p { font-size: 14px; color: #5f6368; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">&#x2713;</div>
    <h1>Authentication successful</h1>
    <p>You can close this tab and return to the console.</p>
  </div>
</body>
</html>`);
          resolve();
        } catch (e) {
          reject(e);
        } finally {
          server.close();
        }
      });

      server.listen(port, host, () => {});

      server.on("error", (err) => {
        reject(new Error(`OAuth callback server error: ${err}`));
      });
    });

    return { authUrl, loginCompletePromise };
  }
}
