/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Abstract base class for token storage backends. Provides shared validation
 * and server-name sanitization logic used by both keychain and file storage.
 */

import type { OAuthCredentials, TokenStorage } from "./types";


/**
 * Foundation for concrete storage implementations. Subclasses must implement
 * all TokenStorage methods; this class contributes credential validation and
 * safe server-name normalization.
 */
export abstract class BaseTokenStorage implements TokenStorage {
  protected readonly serviceName: string;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
  }

  /**
   * Retrieves credentials for a given server name.
   */
  abstract getCredentials(serverName: string): Promise<OAuthCredentials | null>;

  /**
   * Persists credentials to the storage backend.
   */
  abstract setCredentials(credentials: OAuthCredentials): Promise<void>;

  /**
   * Removes credentials for a given server name.
   */
  abstract deleteCredentials(serverName: string): Promise<void>;

  /**
   * Returns the names of all servers with stored credentials.
   */
  abstract listServers(): Promise<string[]>;

  /**
   * Returns all stored credentials keyed by server name.
   */
  abstract getAllCredentials(): Promise<Map<string, OAuthCredentials>>;

  /**
   * Removes all stored credentials from this backend.
   */
  abstract clearAll(): Promise<void>;

  /**
   * Ensures the credential record contains the minimum required fields
   * before persisting it to storage.
   */
  // oxlint-disable-next-line class-methods-use-this
  protected validateCredentials(credentials: OAuthCredentials): void {
    if (!credentials.serverName) {
      throw new Error("Server name is required");
    }
    if (!credentials.token) {
      throw new Error("Token is required");
    }
    if (!credentials.token.accessToken && !credentials.token.refreshToken) {
      throw new Error("Access token or refresh token is required");
    }
    if (!credentials.token.tokenType) {
      throw new Error("Token type is required");
    }
  }

  /**
   * Replaces characters that are unsafe for use as storage keys with
   * underscores, keeping only alphanumerics, hyphens, dots, and underscores.
   */
  // oxlint-disable-next-line class-methods-use-this
  protected sanitizeServerName(serverName: string): string {
    return serverName.replace(/[^a-zA-Z0-9-_.]/g, "_");
  }
}
