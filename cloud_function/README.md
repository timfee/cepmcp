# OAuth Token Exchange - Cloud Run Function

This directory contains a Cloud Run function that acts as the OAuth 2.0 token
exchange endpoint for the CEP MCP server. It holds the OAuth client secret
securely in Google Cloud Secret Manager so it never needs to exist on the
user's local machine.

## What It Does

The function handles two request types:

1. **OAuth Callback** (`GET /callback` or `GET /oauth2callback`): Receives the
   authorization code from Google after user consent, exchanges it for access
   and refresh tokens using the client secret from Secret Manager, then either
   redirects to the local MCP server or shows a manual credential-copy page.

2. **Token Refresh** (`POST /refresh` or `POST /refreshToken`): Accepts a
   refresh token and returns a new access token, again using the client secret
   from Secret Manager.

## Prerequisites

- [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) (`gcloud` CLI)
- A Google Cloud project with billing enabled
- Node.js 18+ (for local testing)

## Setup

### 1. Create an OAuth 2.0 Client

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) and
   select your project
2. Navigate to **APIs & Services > Credentials**
3. Click **Create Credentials > OAuth client ID**
4. Select **Web application** as the application type
5. Under **Authorized redirect URIs**, add the URL of the Cloud Run function
   you will deploy (you can update this after deploying):
   ```
   https://YOUR_FUNCTION_URL/oauth2callback
   ```
6. Note the **Client ID** and **Client Secret** values

See [Setting up OAuth 2.0](https://support.google.com/cloud/answer/6158849?hl=en)
for full details.

### 2. Configure the OAuth Consent Screen

1. Navigate to **Google Auth platform > Branding** in Cloud Console
2. Set the user support email and developer contact email
3. Under **Audience**, choose **Internal** (for Workspace/Cloud Identity
   organizations) or **External** (add test users while in testing mode)
4. Add the CEP scopes the extension requires:
   - `https://www.googleapis.com/auth/chrome.management.reports.readonly`
   - `https://www.googleapis.com/auth/cloud-platform`
   - `https://www.googleapis.com/auth/chrome.management.profiles.readonly`
   - `https://www.googleapis.com/auth/chrome.management.policy`
   - `https://www.googleapis.com/auth/cloud-identity.policies`
   - `https://www.googleapis.com/auth/admin.reports.audit.readonly`
   - `https://www.googleapis.com/auth/ediscovery`
   - `https://www.googleapis.com/auth/admin.directory.orgunit`
   - `https://www.googleapis.com/auth/admin.directory.group`
   - `https://www.googleapis.com/auth/admin.directory.user`

See [Configure the OAuth consent screen](https://developers.google.com/workspace/guides/configure-oauth-consent)
for full details.

### 3. Store the Client Secret in Secret Manager

The function reads the OAuth client secret from Secret Manager at runtime.
This avoids baking it into environment variables or source code.

```bash
# Enable the Secret Manager API
gcloud services enable secretmanager.googleapis.com

# Create the secret
echo -n "YOUR_CLIENT_SECRET" | \
  gcloud secrets create cep-oauth-client-secret \
    --data-file=- \
    --replication-policy=automatic
```

Grant the Cloud Run service account access to the secret:

```bash
# Find your project number
PROJECT_NUMBER=$(gcloud projects describe $(gcloud config get-value project) \
  --format='value(projectNumber)')

# The default Compute Engine service account is used by Cloud Run
SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# Grant Secret Manager Secret Accessor role
gcloud secrets add-iam-policy-binding cep-oauth-client-secret \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor"
```

**Gotcha:** The `roles/editor` and `roles/viewer` roles do **not** include
`secretmanager.versions.access`. You must explicitly grant the
`roles/secretmanager.secretAccessor` role to the service account that runs
the Cloud Run function, or it will fail at runtime with a permission denied
error. See
[Secret Manager access control](https://docs.cloud.google.com/secret-manager/docs/access-control)
for the full IAM reference.

### 4. Deploy the Function

```bash
cd cloud_function

gcloud run deploy cep-oauth-handler \
  --source . \
  --function oauthHandler \
  --base-image nodejs22 \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars "CLIENT_ID=YOUR_CLIENT_ID,SECRET_NAME=projects/YOUR_PROJECT_ID/secrets/cep-oauth-client-secret/versions/latest,REDIRECT_URI=https://YOUR_FUNCTION_URL/oauth2callback"
```

Replace the placeholder values:

| Variable | Value |
|----------|-------|
| `CLIENT_ID` | The OAuth client ID from step 1 |
| `SECRET_NAME` | Full resource name: `projects/PROJECT_ID/secrets/SECRET_NAME/versions/latest` |
| `REDIRECT_URI` | The public URL of this function + `/oauth2callback` |

**Gotcha:** After the first deploy, Cloud Run assigns a URL like
`https://cep-oauth-handler-XXXXXXXXXX-uc.a.run.app`. You need to:
1. Copy that URL
2. Set `REDIRECT_URI` to `https://cep-oauth-handler-XXXXXXXXXX-uc.a.run.app/oauth2callback`
3. Add the same URI to **Authorized redirect URIs** in the OAuth client config
4. Redeploy with the updated `REDIRECT_URI` environment variable

It may take 5 minutes to a few hours for redirect URI changes to take effect
in Google's OAuth system.

See [Deploy a Cloud Run function](https://docs.cloud.google.com/run/docs/deploy-functions)
for the full deployment reference.

### 5. Update the MCP Server Constants

After deploying, update `CLOUD_FUNCTION_URL` in
`workspace-server/src/constants.ts` to point to your Cloud Run function URL.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CLIENT_ID` | Yes | Google OAuth 2.0 client ID |
| `SECRET_NAME` | Yes | Full Secret Manager resource name for the client secret |
| `REDIRECT_URI` | Yes | The public URL of this function's OAuth callback endpoint |

**Do not** store the client secret as a plain environment variable. Always use
Secret Manager. See
[Configure secrets for services](https://docs.cloud.google.com/run/docs/configuring/services/secrets).

## Local Development

```bash
cd cloud_function
npm install

# Set required environment variables
export CLIENT_ID="your-client-id"
export SECRET_NAME="projects/your-project/secrets/your-secret/versions/latest"
export REDIRECT_URI="http://localhost:8080/oauth2callback"

# Start the local functions framework server
npm start
```

**Gotcha:** Local development still calls Secret Manager over the network. You
must have Application Default Credentials configured with access to the secret:

```bash
gcloud auth application-default login
```

Your ADC user account needs the `roles/secretmanager.secretAccessor` role on
the secret, or you can use service account impersonation. See
[Authenticate to Secret Manager](https://docs.cloud.google.com/secret-manager/docs/authentication).

## Common Gotchas

**Service account permissions for Secret Manager:** The Cloud Run service
account (usually the default Compute Engine service account) must have
`roles/secretmanager.secretAccessor` on the specific secret. Without this,
the function will start but fail at runtime when it tries to read the client
secret. The broader `roles/editor` role is not sufficient.

**Redirect URI mismatch:** The `REDIRECT_URI` environment variable, the
Authorized redirect URI in the OAuth client config, and the actual URL of
the deployed function must all match exactly. A trailing slash difference
will cause a `redirect_uri_mismatch` error.

**OAuth consent screen user type:** If you chose "External" user type for
the consent screen, only users listed as test users can authorize until you
publish the app. For internal organization use, choose "Internal" so all
users in your Workspace/Cloud Identity domain can authorize immediately.

**Secret version pinning:** Using `versions/latest` in `SECRET_NAME` is
convenient but means rotating the secret takes effect immediately. For
production, consider pinning to a specific version number and redeploying
when you rotate.

## References

- [Deploy a Cloud Run function](https://docs.cloud.google.com/run/docs/deploy-functions)
- [Cloud Run functions quickstart (Node.js)](https://cloud.google.com/functions/docs/create-deploy-http-nodejs)
- [Configure secrets for Cloud Run services](https://docs.cloud.google.com/run/docs/configuring/services/secrets)
- [Secret Manager access control](https://docs.cloud.google.com/secret-manager/docs/access-control)
- [Secret Manager authentication](https://docs.cloud.google.com/secret-manager/docs/authentication)
- [Setting up OAuth 2.0](https://support.google.com/cloud/answer/6158849?hl=en)
- [Configure the OAuth consent screen](https://developers.google.com/workspace/guides/configure-oauth-consent)
- [Using OAuth 2.0 for web server apps](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Cloud Run environment variables](https://cloud.google.com/run/docs/configuring/services/environment-variables)
