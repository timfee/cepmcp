/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * High-level credential API that bridges Google's Credentials format with the
 * internal OAuthCredentials storage format. All callers in the auth layer use
 * these three functions instead of interacting with storage directly.
 */

import type { Credentials } from "google-auth-library";

import { KEYCHAIN_SERVICE_NAME, MAIN_ACCOUNT_KEY } from "../../constants";
import type { OAuthCredentials } from "./types";
import { HybridTokenStorage } from "./hybrid-token-storage";


const storage = new HybridTokenStorage(KEYCHAIN_SERVICE_NAME);


/**
 * Loads cached OAuth credentials from persistent storage and converts them
 * from the internal OAuthCredentials format into Google's Credentials shape.
 */
export async function loadCredentials(): Promise<Credentials | null> {
  const credentials = await storage.getCredentials(MAIN_ACCOUNT_KEY);

  if (!credentials?.token) {
    return null;
  }

  const { accessToken, refreshToken, expiresAt, tokenType, scope } =
    credentials.token;

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


/**
 * Persists Google OAuth credentials by converting them into the internal
 * OAuthCredentials format and writing them to the active storage backend.
 */
export async function saveCredentials(credentials: Credentials): Promise<void> {
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
 * Removes the cached OAuth credentials for the main account from storage,
 * forcing a fresh login on the next authentication attempt.
 */
export async function clearCredentials(): Promise<void> {
  await storage.deleteCredentials(MAIN_ACCOUNT_KEY);
}
