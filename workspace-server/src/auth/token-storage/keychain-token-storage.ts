/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * OS-native keychain storage backend using the keytar package. Preferred over
 * file-based storage when available because credentials are managed by the
 * operating system's secure credential store (macOS Keychain, Linux libsecret).
 */

import * as crypto from "node:crypto";

import type { OAuthCredentials } from "./types";

import { BaseTokenStorage } from "./base-token-storage";


/**
 * Minimal interface for the keytar native module, used to avoid a hard
 * compile-time dependency on the optional native addon.
 */
interface Keytar {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(
    service: string,
    account: string,
    password: string
  ): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
  findCredentials(
    service: string
  ): Promise<Array<{ account: string; password: string }>>;
}


const KEYCHAIN_TEST_PREFIX = "__keychain_test__";


/**
 * Stores and retrieves OAuth credentials via the platform keychain through
 * the keytar native module. Performs a set-get-delete probe on first use to
 * confirm the keychain is functional before committing to this backend.
 */
export class KeychainTokenStorage extends BaseTokenStorage {
  private keychainAvailable: boolean | null = null;
  private keytarModule: Keytar | null = null;
  private keytarLoadAttempted = false;

  /**
   * Lazily loads the keytar native module, caching the result so subsequent
   * calls skip the dynamic import.
   */
  async getKeytar(): Promise<Keytar | null> {
    if (this.keytarLoadAttempted) {
      return this.keytarModule;
    }

    this.keytarLoadAttempted = true;

    try {
      const moduleName = "keytar";
      const module = await import(moduleName);
      this.keytarModule = module.default || module;
    } catch (error) {
      console.error("[keychain] failed to load keytar:", error);
    }
    return this.keytarModule;
  }

  /**
   * Asserts keychain availability and returns the keytar module, throwing
   * if either check fails. Centralizes the guard clause used by all methods.
   */
  private async requireKeytar(): Promise<Keytar> {
    if (!(await this.checkKeychainAvailability())) {
      throw new Error("Keychain is not available");
    }

    const keytar = await this.getKeytar();
    if (!keytar) {
      throw new Error("Keytar module not available");
    }

    return keytar;
  }

  /**
   * Reads and deserializes credentials for a server from the keychain.
   */
  async getCredentials(serverName: string): Promise<OAuthCredentials | null> {
    const keytar = await this.requireKeytar();

    try {
      const sanitizedName = this.sanitizeServerName(serverName);
      const data = await keytar.getPassword(this.serviceName, sanitizedName);
      if (!data) {
        return null;
      }
      return JSON.parse(data) as OAuthCredentials;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(
          `Failed to parse stored credentials for ${serverName}`,
          { cause: error }
        );
      }
      throw error;
    }
  }

  /**
   * Validates and persists credentials to the keychain, stamping updatedAt.
   */
  async setCredentials(credentials: OAuthCredentials): Promise<void> {
    const keytar = await this.requireKeytar();
    this.validateCredentials(credentials);

    const sanitizedName = this.sanitizeServerName(credentials.serverName);
    const updatedCredentials: OAuthCredentials = {
      ...credentials,
      updatedAt: Date.now(),
    };

    const data = JSON.stringify(updatedCredentials);
    await keytar.setPassword(this.serviceName, sanitizedName, data);
  }

  /**
   * Removes a single server's credentials from the keychain.
   */
  async deleteCredentials(serverName: string): Promise<void> {
    const keytar = await this.requireKeytar();

    const sanitizedName = this.sanitizeServerName(serverName);
    const deleted = await keytar.deletePassword(
      this.serviceName,
      sanitizedName
    );

    if (!deleted) {
      throw new Error(`No credentials found for ${serverName}`);
    }
  }

  /**
   * Enumerates all server names stored in the keychain, excluding internal
   * test entries used by the availability probe.
   */
  async listServers(): Promise<string[]> {
    const keytar = await this.requireKeytar();

    try {
      const credentials = await keytar.findCredentials(this.serviceName);
      return credentials
        .filter((cred) => !cred.account.startsWith(KEYCHAIN_TEST_PREFIX))
        .map((cred) => cred.account);
    } catch (error) {
      console.error("[keychain] failed to list servers:", error);
      return [];
    }
  }

  /**
   * Loads and validates every credential entry from the keychain, skipping
   * entries that fail to parse or validate.
   */
  async getAllCredentials(): Promise<Map<string, OAuthCredentials>> {
    const keytar = await this.requireKeytar();
    const result = new Map<string, OAuthCredentials>();

    try {
      const entries = (
        await keytar.findCredentials(this.serviceName)
      ).filter((c) => !c.account.startsWith(KEYCHAIN_TEST_PREFIX));

      for (const entry of entries) {
        try {
          const data = JSON.parse(entry.password) as OAuthCredentials;
          this.validateCredentials(data);
          result.set(entry.account, data);
        } catch (error) {
          console.error(
            `[keychain] skipping invalid credentials for ${entry.account}:`,
            error
          );
        }
      }
    } catch (error) {
      console.error("[keychain] failed to enumerate credentials:", error);
    }

    return result;
  }

  /**
   * Deletes every credential entry from the keychain for this service.
   * Collects individual deletion errors and throws a combined message.
   */
  async clearAll(): Promise<void> {
    const keytar = await this.requireKeytar();

    let servers: string[];
    try {
      const creds = await keytar.findCredentials(this.serviceName);
      servers = creds.map((c) => c.account);
    } catch (error) {
      throw new Error(
        `Failed to list servers for clearing: ${(error as Error).message}`
      );
    }

    const errors: Error[] = [];
    for (const server of servers) {
      try {
        await this.deleteCredentials(server);
      } catch (error) {
        errors.push(error as Error);
      }
    }

    if (errors.length > 0) {
      throw new Error(
        `Failed to clear some credentials: ${errors.map((e) => e.message).join(", ")}`
      );
    }
  }

  /**
   * Performs a set-get-delete smoke test against the keychain to confirm
   * the native module and underlying OS service are functional. The result
   * is cached so the probe only runs once per instance.
   */
  async checkKeychainAvailability(): Promise<boolean> {
    if (this.keychainAvailable !== null) {
      return this.keychainAvailable;
    }

    try {
      const keytar = await this.getKeytar();
      if (!keytar) {
        this.keychainAvailable = false;
        return false;
      }

      const testAccount = `${KEYCHAIN_TEST_PREFIX}${crypto.randomBytes(8).toString("hex")}`;
      const testPassword = "test";

      await keytar.setPassword(this.serviceName, testAccount, testPassword);
      const retrieved = await keytar.getPassword(this.serviceName, testAccount);
      const deleted = await keytar.deletePassword(
        this.serviceName,
        testAccount
      );

      const success = deleted && retrieved === testPassword;
      this.keychainAvailable = success;
      return success;
    } catch {
      this.keychainAvailable = false;
      return false;
    }
  }

  /**
   * Convenience alias for checkKeychainAvailability, used by HybridTokenStorage
   * during backend selection.
   */
  async isAvailable(): Promise<boolean> {
    return this.checkKeychainAvailability();
  }
}
