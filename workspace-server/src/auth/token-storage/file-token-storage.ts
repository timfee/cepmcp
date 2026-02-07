/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Encrypted file-based token storage backend. Uses AES-256-GCM with a
 * machine-specific derived key to persist credentials when the OS keychain
 * is unavailable. The master key is auto-generated on first use and stored
 * with restrictive file permissions.
 */

import * as crypto from "node:crypto";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type { OAuthCredentials } from "./types";

import { logToFile } from "../../utils/logger";
import {
  ENCRYPTED_TOKEN_PATH,
  ENCRYPTION_MASTER_KEY_PATH,
} from "../../utils/paths";
import { BaseTokenStorage } from "./base-token-storage";


/**
 * Persists OAuth credentials as an AES-256-GCM encrypted JSON file. The
 * encryption key is derived from a randomly generated master key combined
 * with machine-specific salt (hostname + username).
 */
export class FileTokenStorage extends BaseTokenStorage {
  private readonly tokenFilePath: string;
  private readonly encryptionKey: Buffer;
  private readonly masterKey: Buffer;

  private constructor(serviceName: string, masterKey: Buffer) {
    super(serviceName);
    this.tokenFilePath = ENCRYPTED_TOKEN_PATH;
    this.masterKey = masterKey;
    this.encryptionKey = this.deriveEncryptionKey();
  }

  /**
   * Factory that loads (or generates) the master key before constructing
   * the storage instance, since the constructor cannot be async.
   */
  static async create(serviceName: string): Promise<FileTokenStorage> {
    const masterKey = await this.loadMasterKey();
    return new FileTokenStorage(serviceName, masterKey);
  }

  /**
   * Reads the master key from disk, creating a new 256-bit random key with
   * mode 0600 if the file does not yet exist.
   */
  private static async loadMasterKey(): Promise<Buffer> {
    try {
      const masterKey = await fs.readFile(ENCRYPTION_MASTER_KEY_PATH);
      return masterKey;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        const newKey = crypto.randomBytes(32);
        await fs.writeFile(ENCRYPTION_MASTER_KEY_PATH, newKey, { mode: 0o600 });
        return newKey;
      }
      throw error;
    }
  }

  private deriveEncryptionKey(): Buffer {
    const salt = `${os.hostname()}-${
      os.userInfo().username
    }-gemini-cli-workspace`;
    return crypto.scryptSync(this.masterKey, salt, 32);
  }

  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.encryptionKey, iv);

    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag();

    return iv.toString("hex") + ":" + authTag.toString("hex") + ":" + encrypted;
  }

  private decrypt(encryptedData: string): string {
    const parts = encryptedData.split(":");
    if (parts.length !== 3) {
      throw new Error("Invalid encrypted data format");
    }

    const ivStr = parts[0];
    const authTagStr = parts[1];
    const encrypted = parts[2];

    if (!ivStr || !authTagStr || !encrypted) {
      throw new Error("Invalid encrypted data format: missing parts");
    }

    const iv = Buffer.from(ivStr, "hex");
    const authTag = Buffer.from(authTagStr, "hex");

    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      this.encryptionKey,
      iv
    );
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  }

  private async ensureDirectoryExists(): Promise<void> {
    const dir = path.dirname(this.tokenFilePath);
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  }

  /**
   * Reads and decrypts the token file, returning an empty map when the file
   * is missing or corrupted rather than propagating the error.
   */
  private async loadTokens(): Promise<Map<string, OAuthCredentials>> {
    try {
      const data = await fs.readFile(this.tokenFilePath, "utf-8");
      const decrypted = this.decrypt(data);
      const tokens = JSON.parse(decrypted) as Record<string, OAuthCredentials>;
      return new Map(Object.entries(tokens));
    } catch (error: unknown) {
      const err = error as NodeJS.ErrnoException & { message?: string };
      if (err.code === "ENOENT") {
        logToFile("Token file does not exist");
        return new Map<string, OAuthCredentials>();
      }
      if (
        err.message?.includes("Invalid encrypted data format") ||
        err.message?.includes(
          "Unsupported state or unable to authenticate data"
        )
      ) {
        logToFile("Token file corrupted");
        return new Map<string, OAuthCredentials>();
      }
      throw error;
    }
  }

  /**
   * Encrypts and writes the full token map to disk with mode 0600.
   */
  private async saveTokens(
    tokens: Map<string, OAuthCredentials>
  ): Promise<void> {
    await this.ensureDirectoryExists();

    const data = Object.fromEntries(tokens);
    const json = JSON.stringify(data, null, 2);
    const encrypted = this.encrypt(json);

    await fs.writeFile(this.tokenFilePath, encrypted, { mode: 0o600 });
  }

  /**
   * Retrieves credentials for a single server from the encrypted file.
   */
  async getCredentials(serverName: string): Promise<OAuthCredentials | null> {
    const tokens = await this.loadTokens();
    const credentials = tokens.get(serverName);

    if (!credentials) {
      return null;
    }

    return credentials;
  }

  /**
   * Validates, timestamps, and persists credentials into the encrypted file.
   */
  async setCredentials(credentials: OAuthCredentials): Promise<void> {
    this.validateCredentials(credentials);

    const tokens = await this.loadTokens();
    const updatedCredentials: OAuthCredentials = {
      ...credentials,
      updatedAt: Date.now(),
    };

    tokens.set(credentials.serverName, updatedCredentials);
    await this.saveTokens(tokens);
  }

  /**
   * Removes a single server's entry from the encrypted file, deleting the
   * file entirely when no entries remain.
   */
  async deleteCredentials(serverName: string): Promise<void> {
    const tokens = await this.loadTokens();

    if (!tokens.has(serverName)) {
      throw new Error(`No credentials found for ${serverName}`);
    }

    tokens.delete(serverName);

    if (tokens.size === 0) {
      try {
        await fs.unlink(this.tokenFilePath);
      } catch (error: unknown) {
        const err = error as NodeJS.ErrnoException;
        if (err.code !== "ENOENT") {
          throw error;
        }
      }
    } else {
      await this.saveTokens(tokens);
    }
  }

  /**
   * Returns the names of all servers with stored credentials.
   */
  async listServers(): Promise<string[]> {
    const tokens = await this.loadTokens();
    return Array.from(tokens.keys());
  }

  /**
   * Loads all credentials, skipping entries that fail validation.
   */
  async getAllCredentials(): Promise<Map<string, OAuthCredentials>> {
    const tokens = await this.loadTokens();
    const result = new Map<string, OAuthCredentials>();

    for (const [serverName, credentials] of tokens) {
      try {
        this.validateCredentials(credentials);
        result.set(serverName, credentials);
      } catch (error) {
        console.error(`[storage] skipping invalid credentials for ${serverName}:`, error);
      }
    }

    return result;
  }

  /**
   * Deletes the encrypted token file, silently ignoring if it does not exist.
   */
  async clearAll(): Promise<void> {
    try {
      await fs.unlink(this.tokenFilePath);
    } catch (error: unknown) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== "ENOENT") {
        throw error;
      }
    }
  }
}
