/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared constants for the CEP MCP server. Centralizes URLs, OAuth
 * configuration, and service identifiers so they can be updated in one place.
 */

/**
 * Google OAuth 2.0 client ID for the CEP extension.
 */
export const CLIENT_ID =
  "226520923819-539vjitqbghl1uj9dv067jrd4lhcakog.apps.googleusercontent.com";


/**
 * Cloud Run endpoint that holds the client secret and handles OAuth
 * token exchange and refresh on behalf of the client.
 */
export const CLOUD_FUNCTION_URL =
  "https://cepmcp-226520923819.europe-west1.run.app";


/**
 * How far before token expiry to trigger a proactive refresh (5 minutes).
 */
export const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;


/**
 * How long to wait for the user to complete the browser OAuth flow.
 */
export const AUTH_TIMEOUT_MS = 5 * 60 * 1000;


/**
 * Keychain service name used to store credentials in the OS keychain.
 */
export const KEYCHAIN_SERVICE_NAME = "gemini-cli-cep-oauth";


/**
 * Storage key for the primary authenticated account.
 */
export const MAIN_ACCOUNT_KEY = "main-account";


/**
 * Google API OAuth scopes required for Chrome Enterprise Premium integration.
 */
export const SCOPES = [
  "https://www.googleapis.com/auth/chrome.management.reports.readonly",
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/chrome.management.profiles.readonly",
  "https://www.googleapis.com/auth/chrome.management.policy",
  "https://www.googleapis.com/auth/cloud-identity.policies",
  "https://www.googleapis.com/auth/admin.reports.audit.readonly",
  "https://www.googleapis.com/auth/ediscovery",
  "https://www.googleapis.com/auth/admin.directory.orgunit",
  "https://www.googleapis.com/auth/admin.directory.group",
  "https://www.googleapis.com/auth/admin.directory.user",
] as const;
