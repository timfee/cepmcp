/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Credentials } from "google-auth-library";

import type { OAuthCredentials } from "./types";

import { HybridTokenStorage } from "./hybrid-token-storage";

const KEYCHAIN_SERVICE_NAME = "gemini-cli-workspace-oauth";
const MAIN_ACCOUNT_KEY = "main-account";

const storage = new HybridTokenStorage(KEYCHAIN_SERVICE_NAME);

/**
 * Load cached OAuth credentials
 */
export async function loadCredentials(): Promise<Credentials | null> {
  const credentials = await storage.getCredentials(MAIN_ACCOUNT_KEY);

  if (credentials?.token) {
    const { accessToken, refreshToken, expiresAt, tokenType, scope } =
      credentials.token;
    // Convert from OAuthCredentials format to Google Credentials format
    const googleCreds: Credentials = {
      access_token: accessToken,
      refresh_token: refreshToken || undefined,
      token_type: tokenType || undefined,
      scope: scope || undefined,
    };

    if (expiresAt) {
      googleCreds.expiry_date = expiresAt;
    }

    return googleCreds;
  }

  return null;
}

/**
 * Save OAuth credentials
 */
export async function saveCredentials(credentials: Credentials): Promise<void> {
  // Convert Google Credentials to OAuthCredentials format
  const mcpCredentials: OAuthCredentials = {
    serverName: MAIN_ACCOUNT_KEY,
    token: {
      accessToken: credentials.access_token || undefined,
      refreshToken: credentials.refresh_token || undefined,
      tokenType: credentials.token_type || "Bearer",
      scope: credentials.scope || undefined,
      expiresAt: credentials.expiry_date || undefined,
    },
    updatedAt: Date.now(),
  };

  await storage.setCredentials(mcpCredentials);
}

/**
 * Clear cached OAuth credentials
 */
export async function clearCredentials(): Promise<void> {
  await storage.deleteCredentials(MAIN_ACCOUNT_KEY);
}
