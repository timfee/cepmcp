/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

console.log("[VERBOSE] Script start.");

process.on("unhandledRejection", (reason, promise) => {
  console.error(
    "[VERBOSE] CRITICAL: Unhandled Rejection at:",
    promise,
    "reason:",
    reason
  );
  // process.exit(1); // Optionally force non-zero exit
});
console.log("[VERBOSE] Unhandled Rejection handler registered.");

process.on("uncaughtException", (err, origin) => {
  console.error(
    "[VERBOSE] CRITICAL: Uncaught Exception thrown:",
    err,
    "origin:",
    origin
  );
  process.exit(1);
});
console.log("[VERBOSE] Uncaught Exception handler registered.");

// Import required packages
console.log("[VERBOSE] Importing @google-cloud/functions-framework...");
const functions = require("@google-cloud/functions-framework");
console.log("[VERBOSE] Imported @google-cloud/functions-framework.");

console.log("[VERBOSE] Importing @google-cloud/secret-manager...");
const { SecretManagerServiceClient } = require("@google-cloud/secret-manager");
console.log("[VERBOSE] Imported @google-cloud/secret-manager.");

console.log("[VERBOSE] Importing axios...");
const axios = require("axios");
console.log("[VERBOSE] Imported axios.");

console.log("[VERBOSE] Importing node:url...");
const { URL } = require("node:url");
console.log("[VERBOSE] Imported node:url.");

console.log("[VERBOSE] Imports done.");

// --- Configuration loaded from Environment Variables ---
console.log("[VERBOSE] Loading environment variables...");
const CLIENT_ID = process.env.CLIENT_ID;
const SECRET_NAME = process.env.SECRET_NAME;
const REDIRECT_URI = process.env.REDIRECT_URI;
console.log(`[VERBOSE] CLIENT_ID: ${CLIENT_ID}`);
console.log(`[VERBOSE] SECRET_NAME: ${SECRET_NAME}`);
console.log(`[VERBOSE] REDIRECT_URI: ${REDIRECT_URI}`);

// Fail fast if required environment variables are missing
if (!CLIENT_ID || !SECRET_NAME || !REDIRECT_URI) {
  console.error(
    "[VERBOSE] Missing required environment variables. Throwing error."
  );
  throw new Error(
    "Missing required environment variables: CLIENT_ID, SECRET_NAME, and REDIRECT_URI must be set."
  );
}
console.log("[VERBOSE] Environment variables check passed.");

console.log("[VERBOSE] Hello, we're starting!");

// --- Configuration for local storage (used in instructions) ---
const KEYCHAIN_SERVICE_NAME = "gemini-cli-cep-oauth";
const KEYCHAIN_ACCOUNT_NAME = "main-account";
console.log("[VERBOSE] Keychain constants set.");
// --- END CONFIGURATION ---

// Initialize the Secret Manager client
console.log("[VERBOSE] Initializing SecretManagerServiceClient...");
const secretClient = new SecretManagerServiceClient();
console.log("[VERBOSE] SecretManagerServiceClient initialized.");

/**
 * Helper function to access a secret from Secret Manager.
 */
async function getClientSecret() {
  console.log("[VERBOSE] getClientSecret: Start");
  try {
    console.log(
      `[VERBOSE] getClientSecret: Accessing secret version: ${SECRET_NAME}`
    );
    const [version] = await secretClient.accessSecretVersion({
      name: SECRET_NAME,
    });
    console.log("[VERBOSE] getClientSecret: Secret version accessed.");
    const payload = version.payload.data.toString("utf8");
    console.log("[VERBOSE] getClientSecret: Secret payload decoded.");
    console.log("[VERBOSE] getClientSecret: Success");
    return payload;
  } catch (error) {
    console.error(
      "[VERBOSE] getClientSecret: Failed to access secret version:",
      error
    );
    throw new Error("Could not retrieve client secret.", { cause: error });
  }
}

/**
 * Handles the OAuth 2.0 callback.
 * @param {Object} req Express request object.
 * @param {Object} res Express response object.
 */
async function handleCallback(req, res) {
  console.log("[VERBOSE] handleCallback: Start");
  const code = req.query.code;
  const state = req.query.state;
  console.log(`[VERBOSE] handleCallback: Code: ${code}, State: ${state}`);

  if (!code) {
    console.error(
      "[VERBOSE] handleCallback: Missing authorization code in request query parameters."
    );
    return res.status(400).send("Error: Missing authorization code.");
  }

  try {
    console.log("[VERBOSE] handleCallback: Getting client secret...");
    const clientSecret = await getClientSecret();
    console.log("[VERBOSE] handleCallback: Client secret retrieved.");

    const tokenRequestPayload = {
      client_id: CLIENT_ID,
      client_secret: clientSecret,
      code: code,
      grant_type: "authorization_code",
      redirect_uri: REDIRECT_URI,
    };
    console.log(
      "[VERBOSE] handleCallback: Token exchange payload:",
      tokenRequestPayload
    );

    console.log("[VERBOSE] handleCallback: Performing token exchange...");
    const tokenResponse = await axios.post(
      "https://oauth2.googleapis.com/token",
      tokenRequestPayload
    );
    console.log(
      "[VERBOSE] handleCallback: Token exchange successful:",
      tokenResponse.data
    );

    const { access_token, refresh_token, expires_in, scope, token_type } =
      tokenResponse.data;

    const expiry_date = Date.now() + expires_in * 1000;
    console.log(
      `[VERBOSE] handleCallback: Expiry date calculated: ${expiry_date}`
    );

    if (state) {
      console.log("[VERBOSE] handleCallback: State parameter present.");
      try {
        if (state.length > 4096) {
          console.error("[VERBOSE] handleCallback: State parameter too large.");
          throw new Error("State parameter exceeds size limit of 4KB.");
        }

        console.log("[VERBOSE] handleCallback: Decoding state parameter...");
        const payload = JSON.parse(
          Buffer.from(state, "base64").toString("utf8")
        );
        console.log("[VERBOSE] handleCallback: State payload:", payload);

        if (payload && payload.manual === false && payload.uri) {
          console.log(
            "[VERBOSE] handleCallback: Manual mode is false, redirect URI present."
          );
          const redirectUrl = new URL(payload.uri);
          console.log(
            `[VERBOSE] handleCallback: Parsed redirect URL: ${redirectUrl}`
          );

          if (
            redirectUrl.hostname !== "localhost" &&
            redirectUrl.hostname !== "127.0.0.1"
          ) {
            console.error(
              `[VERBOSE] handleCallback: Invalid redirect hostname: ${redirectUrl.hostname}`
            );
            throw new Error(
              `Invalid redirect hostname: ${redirectUrl.hostname}. Must be localhost or 127.0.0.1.`
            );
          }
          console.log("[VERBOSE] handleCallback: Redirect hostname validated.");

          const finalUrl = redirectUrl;
          finalUrl.searchParams.append("access_token", access_token);
          if (refresh_token) {
            finalUrl.searchParams.append("refresh_token", refresh_token);
          }
          finalUrl.searchParams.append("scope", scope);
          finalUrl.searchParams.append("token_type", token_type);
          finalUrl.searchParams.append("expiry_date", expiry_date.toString());

          if (payload.csrf) {
            finalUrl.searchParams.append("state", payload.csrf);
            console.log(
              "[VERBOSE] handleCallback: Appended CSRF token to final URL."
            );
          }

          console.log(
            `[VERBOSE] handleCallback: Redirecting to: ${finalUrl.toString()}`
          );
          return res.redirect(302, finalUrl.toString());
        } else {
          console.log(
            "[VERBOSE] handleCallback: Not redirecting, manual mode or no URI."
          );
        }
      } catch (e) {
        console.error(
          "[VERBOSE] handleCallback: Error processing state or redirect. Falling back to manual page.",
          e
        );
      }
    } else {
      console.log("[VERBOSE] handleCallback: No state parameter present.");
    }

    console.log(
      "[VERBOSE] handleCallback: Falling back to manual instructions page."
    );
    const credentialsJson = JSON.stringify(
      {
        refresh_token: refresh_token,
        scope: scope,
        token_type: token_type,
        access_token: access_token,
        expiry_date: expiry_date,
      },
      null,
      2
    );

    res.set("Content-Type", "text/html");
    console.log("[VERBOSE] handleCallback: Sending HTML response.");
    res.status(200).send(`
      <html>
        <head><title>OAuth Token Generated</title></head>
        <body>
          <h1>Success! Credentials Ready</h1>
          <textarea id="credentials-json" readonly>${credentialsJson}</textarea>
          <script>function copyCredentials() { /* ... */ }</script>
        </body>
      </html>
    `); // HTML minified for brevity in log
  } catch (error) {
    console.error(
      "[VERBOSE] handleCallback: Error during token exchange process."
    );
    if (axios.isAxiosError(error) && error.response) {
      console.error(
        "[VERBOSE] handleCallback: Axios error:",
        error.response.data
      );
    } else {
      console.error(
        "[VERBOSE] handleCallback: Generic error:",
        error instanceof Error ? error.message : error,
        error
      );
    }
    res
      .status(500)
      .send(
        "An error occurred during the token exchange. Check function logs for details."
      );
  }
  console.log("[VERBOSE] handleCallback: End");
}

/**
 * Handles token refresh.
 */
async function handleRefreshToken(req, res) {
  console.log("[VERBOSE] handleRefreshToken: Start");
  if (req.method !== "POST") {
    console.error(
      `[VERBOSE] handleRefreshToken: Invalid method: ${req.method}`
    );
    return res.status(405).send("Method Not Allowed");
  }

  const { refresh_token } = req.body;
  console.log(
    `[VERBOSE] handleRefreshToken: Refresh token present: ${!!refresh_token}`
  );

  if (!refresh_token) {
    console.error(
      "[VERBOSE] handleRefreshToken: Missing refresh_token in request body"
    );
    return res
      .status(400)
      .send("Error: Missing refresh_token in request body.");
  }

  try {
    console.log("[VERBOSE] handleRefreshToken: Getting client secret...");
    const clientSecret = await getClientSecret();
    console.log("[VERBOSE] handleRefreshToken: Client secret retrieved.");

    const refreshRequestPayload = {
      client_id: CLIENT_ID,
      client_secret: clientSecret,
      refresh_token: refresh_token,
      grant_type: "refresh_token",
    };
    console.log(
      "[VERBOSE] handleRefreshToken: Refresh token payload:",
      refreshRequestPayload
    );

    console.log("[VERBOSE] handleRefreshToken: Performing token refresh...");
    const tokenResponse = await axios.post(
      "https://oauth2.googleapis.com/token",
      refreshRequestPayload
    );
    console.log(
      "[VERBOSE] handleRefreshToken: Token refresh successful:",
      tokenResponse.data
    );

    const { access_token, expires_in, scope, token_type } = tokenResponse.data;
    const expiry_date = Date.now() + expires_in * 1000;
    console.log(
      `[VERBOSE] handleRefreshToken: New expiry date: ${expiry_date}`
    );

    res.status(200).json({
      access_token,
      expiry_date,
      token_type,
      scope,
    });
  } catch (error) {
    console.error("[VERBOSE] handleRefreshToken: Error during token refresh.");
    if (axios.isAxiosError(error) && error.response) {
      console.error(
        "[VERBOSE] handleRefreshToken: Axios error:",
        error.response.data
      );
      res.status(error.response.status).json(error.response.data);
    } else {
      console.error(
        "[VERBOSE] handleRefreshToken: Generic error:",
        error instanceof Error ? error.message : error,
        error
      );
      res.status(500).send("An error occurred during token refresh.");
    }
  }
  console.log("[VERBOSE] handleRefreshToken: End");
}

/**
 * Main entry point for the Cloud Function.
 */
console.log("[VERBOSE] Registering HTTP function 'oauthHandler'...");
try {
  functions.http("oauthHandler", async (req, res) => {
    console.log(
      `[VERBOSE] oauthHandler: Received request: ${req.method} ${req.path}`
    );
    if (
      ["/refresh", "/refreshToken"].includes(req.path) ||
      (req.method === "POST" && req.body?.refresh_token)
    ) {
      console.log("[VERBOSE] oauthHandler: Routing to handleRefreshToken.");
      return handleRefreshToken(req, res);
    }

    if (["/callback", "/oauth2callback"].includes(req.path) || req.query.code) {
      console.log("[VERBOSE] oauthHandler: Routing to handleCallback.");
      return handleCallback(req, res);
    }

    console.error(
      `[VERBOSE] oauthHandler: Unknown request type for path: ${req.path}`
    );
    res
      .status(400)
      .send(
        "Unknown request type. Expected OAuth callback or token refresh request."
      );
  });
  console.log(
    "[VERBOSE] functions.http('oauthHandler') registration call complete."
  );
} catch (e) {
  console.error(
    "[VERBOSE] CRITICAL: Error during functions.http registration:",
    e
  );
  process.exit(1);
}

console.log(
  "[VERBOSE] End of top-level script. Functions Framework should now be in control."
);

// Optional: Add a keep-alive timer to see if the process is being killed externally
// setTimeout(() => {
//   console.log("[VERBOSE] Keep-alive: Still running after 30 seconds...");
// }, 30000);
