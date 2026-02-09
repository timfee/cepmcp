/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * CLI utility for managing OAuth credentials outside the MCP server.
 * Supports clearing credentials, force-expiring tokens for testing,
 * and displaying current authentication status.
 */

import {
  clearCredentials,
  loadCredentials,
  saveCredentials,
} from "../workspace-server/src/auth/token-storage/oauth-credential-storage";


async function clearAuth() {
  try {
    await clearCredentials();
    console.log("✓ Authentication credentials cleared.");
  } catch (error) {
    console.error("✗ Failed to clear authentication credentials:", error);
    process.exit(1);
  }
}


async function expireToken() {
  try {
    const credentials = await loadCredentials();
    if (!credentials) {
      console.log("No credentials found to expire.");
      return;
    }

    credentials.expiry_date = Date.now() - 1000;
    await saveCredentials(credentials);
    console.log("✓ Access token expired. Next API call will trigger refresh.");
  } catch (error) {
    console.error("✗ Failed to expire token:", error);
    process.exit(1);
  }
}


async function showStatus() {
  try {
    const credentials = await loadCredentials();
    if (!credentials) {
      console.log("No credentials found.");
      return;
    }

    const now = Date.now();
    const expiry = credentials.expiry_date;
    const hasRefreshToken = !!credentials.refresh_token;
    const hasAccessToken = !!credentials.access_token;
    const isExpired = expiry ? expiry < now : false;

    console.log("Auth Status:");
    console.log(`  Access Token:  ${hasAccessToken ? "✓ present" : "✗ missing"}`);
    console.log(`  Refresh Token: ${hasRefreshToken ? "✓ present" : "✗ missing"}`);

    if (expiry) {
      console.log(`  Expiry: ${new Date(expiry).toISOString()}`);
      console.log(`  Status: ${isExpired ? "✗ expired" : "✓ valid"}`);
      if (!isExpired) {
        const minutesLeft = Math.floor((expiry - now) / 1000 / 60);
        console.log(`  Time left: ~${minutesLeft} minutes`);
      }
    } else {
      console.log("  Expiry: unknown");
    }
  } catch (error) {
    console.error("✗ Failed to get auth status:", error);
    process.exit(1);
  }
}


function showHelp() {
  console.log(`
Auth Management CLI

Usage: tsx scripts/auth-utils.ts <command>

Commands:
  clear     Clear all authentication credentials
  expire    Force the access token to expire (for testing refresh)
  status    Show current authentication status
  help      Show this help message
`);
}


async function main() {
  const command = process.argv[2];

  switch (command) {
    case "clear":
      await clearAuth();
      break;
    case "expire":
      await expireToken();
      break;
    case "status":
      await showStatus();
      break;
    case "help":
    case "--help":
    case "-h":
      showHelp();
      break;
    default:
      if (!command) {
        console.error("✗ No command specified.");
      } else {
        console.error(`✗ Unknown command: ${command}`);
      }
      showHelp();
      process.exit(1);
  }
}


main();
