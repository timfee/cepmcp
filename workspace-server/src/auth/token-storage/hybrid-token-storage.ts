/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Smart storage selector that tries the native OS keychain first and falls
 * back to encrypted file storage when keychain is unavailable. Lazily
 * initializes the underlying backend on first access with race-condition
 * protection.
 */

import type { TokenStorage, OAuthCredentials } from "./types";

import { BaseTokenStorage } from "./base-token-storage";
import { FileTokenStorage } from "./file-token-storage";
import { TokenStorageType } from "./types";


const FORCE_FILE_STORAGE_ENV_VAR = "GEMINI_CLI_WORKSPACE_FORCE_FILE_STORAGE";


/**
 * Delegates all storage operations to either KeychainTokenStorage or
 * FileTokenStorage, chosen at initialization time based on platform
 * availability and the GEMINI_CLI_WORKSPACE_FORCE_FILE_STORAGE flag.
 */
export class HybridTokenStorage extends BaseTokenStorage {
  private storage: TokenStorage | null = null;
  private storageType: TokenStorageType | null = null;
  private storageInitPromise: Promise<TokenStorage> | null = null;

  /**
   * Probes keychain availability and selects the best storage backend.
   * Falls back to encrypted file storage when keychain init fails.
   */
  private async initializeStorage(): Promise<TokenStorage> {
    const forceFileStorage = process.env[FORCE_FILE_STORAGE_ENV_VAR] === "true";

    if (!forceFileStorage) {
      try {
        const { KeychainTokenStorage } =
          await import("./keychain-token-storage");
        const keychainStorage = new KeychainTokenStorage(this.serviceName);

        const isAvailable = await keychainStorage.isAvailable();
        if (isAvailable) {
          this.storage = keychainStorage;
          this.storageType = TokenStorageType.KEYCHAIN;
          return this.storage;
        }
      } catch (e) {
        console.warn(
          "[storage] keychain init failed, falling back to file storage:",
          e
        );
      }
    }

    this.storage = await FileTokenStorage.create(this.serviceName);
    this.storageType = TokenStorageType.ENCRYPTED_FILE;
    return this.storage;
  }

  /**
   * Returns the resolved storage backend, initializing it on first call.
   * Uses a shared promise to prevent concurrent initialization races.
   */
  private async getStorage(): Promise<TokenStorage> {
    if (this.storage !== null) {
      return this.storage;
    }

    if (!this.storageInitPromise) {
      this.storageInitPromise = this.initializeStorage();
    }

    return await this.storageInitPromise;
  }

  /**
   * Retrieves credentials for a server from the active storage backend.
   */
  async getCredentials(serverName: string): Promise<OAuthCredentials | null> {
    const storage = await this.getStorage();
    return storage.getCredentials(serverName);
  }

  /**
   * Persists credentials through the active storage backend.
   */
  async setCredentials(credentials: OAuthCredentials): Promise<void> {
    const storage = await this.getStorage();
    await storage.setCredentials(credentials);
  }

  /**
   * Removes credentials for a server from the active storage backend.
   */
  async deleteCredentials(serverName: string): Promise<void> {
    const storage = await this.getStorage();
    await storage.deleteCredentials(serverName);
  }

  /**
   * Lists all server names with stored credentials.
   */
  async listServers(): Promise<string[]> {
    const storage = await this.getStorage();
    return storage.listServers();
  }

  /**
   * Returns all stored credentials keyed by server name.
   */
  async getAllCredentials(): Promise<Map<string, OAuthCredentials>> {
    const storage = await this.getStorage();
    return storage.getAllCredentials();
  }

  /**
   * Removes all stored credentials from the active backend.
   */
  async clearAll(): Promise<void> {
    const storage = await this.getStorage();
    await storage.clearAll();
  }

  /**
   * Returns which storage backend was selected after initialization.
   */
  async getStorageType(): Promise<TokenStorageType> {
    await this.getStorage();
    return this.storageType ?? TokenStorageType.ENCRYPTED_FILE;
  }
}
