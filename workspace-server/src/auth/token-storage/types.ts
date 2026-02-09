/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared type definitions for the token storage subsystem. Defines the shapes
 * for OAuth tokens, stored credentials, and the storage interface contract.
 */

/**
 * Shape of an individual OAuth token with optional access and refresh values.
 */
export interface OAuthToken {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  tokenType: string;
  scope?: string;
}


/**
 * Persisted OAuth credential record, keyed by server name, that wraps an
 * OAuthToken with metadata about when it was last updated.
 */
export interface OAuthCredentials {
  serverName: string;
  token: OAuthToken;
  clientId?: string;
  tokenUrl?: string;
  mcpServerUrl?: string;
  updatedAt: number;
}


/**
 * Discriminator for the active storage backend so callers can inspect
 * which strategy the hybrid storage resolved to.
 */
export enum TokenStorageType {
  KEYCHAIN = "keychain",
  ENCRYPTED_FILE = "encrypted_file",
}


/**
 * Contract for persisting and retrieving OAuth credentials. Implementations
 * include KeychainTokenStorage for native OS keychain access and
 * FileTokenStorage for encrypted file-based fallback.
 */
export interface TokenStorage {
  getCredentials(serverName: string): Promise<OAuthCredentials | null>;
  setCredentials(credentials: OAuthCredentials): Promise<void>;
  deleteCredentials(serverName: string): Promise<void>;
  listServers(): Promise<string[]>;
  getAllCredentials(): Promise<Map<string, OAuthCredentials>>;
  clearAll(): Promise<void>;
}
