# Cloudflare deployment — Orbit

## 1. D1 database

For this prepared account, `orbit-db` is already created and its ID is set in `wrangler.json`. Reuse it. If moving to a different account, create a new database under Cloudflare dashboard → Storage & databases → D1 and update both `account_id` and `database_id`.
Copy the resulting database ID into `d1_databases[0].database_id` in `wrangler.json`. Do not use the placeholder `11111111-1111-4111-8111-111111111111` for production.

The binding name must remain `DB`. Schema migrations are in `drizzle/` and applied by `npm run deploy`; do not paste schema SQL into application code.

## 2. Worker from GitHub

Cloudflare → Compute → Workers & Pages → Create application → connect/import a Git repository.
Choose `shubhiivashis/orbit-project-management`, production branch `main`.

- Worker name: `orbit-project-management`
- Project/root directory: repository root (leave blank or `/` as the UI requires)
- Build command: `npm run build`
- Deploy command: `npm run deploy`
- Build environment: `NODE_VERSION=24`

Use Workers, not a static Pages upload. The repository includes a custom `wrangler.json`, Worker entry point, D1 binding, and a migration-aware deploy script. Cloudflare's GitHub application must be authorized for this repository; review its permissions before approving.

The deployment token needs **D1 Edit** for this account because the deploy command applies migrations. The default Workers Builds token may not include D1 access. Review its permissions in Cloudflare profile → API Tokens and add D1 Edit, or select an existing appropriately scoped token in build settings. Keep the token in Cloudflare; never paste it into GitHub source or chat.

When the first deploy succeeds, the URL normally resembles `https://orbit-project-management.<your-workers-subdomain>.workers.dev`. The initial page remains in setup mode until Access is configured. This prevents an unauthenticated first visitor from taking over your workspace.

## 3. Email login with Cloudflare Access

Complete the account's Zero Trust onboarding. Review any plan, billing authorization, and terms yourself.

Open the Worker's Settings → Domains & Routes and enable Cloudflare Access for its `workers.dev` hostname, or create a self-hosted Access application for that entire hostname in Cloudflare One. Do not limit protection to `/` only or leave API routes unprotected. Keep Preview URLs disabled unless separately protected.

In Zero Trust / Cloudflare One:

1. Add **One-time PIN** as a login method under authentication/identity providers if it is not present.
2. Configure an **Allow** policy with the owner's exact email address. Do not choose a bypass policy or allow everyone.
3. Set the application to accept the One-time PIN login method (or your chosen trusted identity provider).
4. Copy the application Audience (AUD) tag and the team domain `https://<team>.cloudflareaccess.com`.

Cloudflare dashboard labels can vary. Official guidance:

- https://developers.cloudflare.com/workers/configuration/cloudflare-access/
- https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/
- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/

## 4. Runtime configuration

Worker → Settings → Variables and Secrets. Add these **runtime** variables, then apply/deploy the settings change:

| Name | Value |
| --- | --- |
| `CF_ACCESS_TEAM_DOMAIN` | `https://<your-team>.cloudflareaccess.com` |
| `CF_ACCESS_AUD` | The Access application's AUD tag |
| `ORBIT_OWNER_EMAIL` | The exact verified email that will own Orbit |

These are configuration values, not GitHub or Cloudflare API tokens. Do not paste an API token into any of them. Do not use build-only variables for runtime identity settings.

Open the published Worker URL. Access should ask for email and then a PIN. The owner creates the workspace first. Cloudflare sends the login PIN; Orbit does not send invitation emails.

## 5. Team access

Add a teammate's exact email in **Orbit → Team members** and in the **Access Allow policy**. They open the same URL and sign in with that email. Test with one teammate before adding everyone.

## Local CLI alternative

If using local Wrangler instead of GitHub builds:

```sh
npx wrangler login
npx wrangler d1 create orbit-db
# Copy the new database ID into wrangler.json before continuing.
npm run build
npm run deploy
```

The CLI login opens an authorization screen. Review it yourself. Tokens are not needed in chat. Set the runtime variables and Access policy in the dashboard afterward.

## Troubleshooting

- **Setup in progress / 503**: check `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` runtime variables.
- **Please sign in / 401**: verify Access protects the exact hostname and that the AUD/issuer match that application.
- **Owner must create workspace first / 403**: sign in using `ORBIT_OWNER_EMAIL`; other allowed emails cannot claim ownership.
- **Ask owner to add your email / 403**: add the same sign-in email to Orbit's team, or restore its access.
- **Missing table**: check D1 binding `DB` and that migrations succeeded.
- **Placeholder database ID**: replace it with the real D1 ID, commit/push, and rebuild.

GitHub stores source code; Cloudflare runs the application. GitHub Pages cannot host this database-backed Worker.
