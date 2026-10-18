# Orbit — independent Cloudflare edition

Team project management with projects, tasks/subtasks, assignments, comments, dependencies, board/list/calendar/timeline views, activity, and data exports.

Orbit runs on **Cloudflare Workers + D1 + Cloudflare Access**. Teammates use their approved email address and an email one-time PIN (or your Access identity provider). A ChatGPT account is not required.

## Run locally

Requires Node.js 24 and npm. On Windows use `npm.cmd` if PowerShell blocks `npm.ps1`.

```sh
npm run install:ci
npm run db:migrate:local
npm run dev
```

Open `http://127.0.0.1:5173/auth/sign-in`. This signs into a loopback-only development account, `owner@orbit.local`. Development identities and their cookie middleware are excluded from production. Local storage is separate from the deployed database.

```sh
npm run check
npm run test:auth
npm test
npm run build
```

`npm test` requires the dev server to be running. It creates a temporary project, checks persistence and owner/member authorization, and removes its test project. It refuses non-local URLs.

## Publish

See [Cloudflare deployment guide](docs/CLOUDFLARE-DEPLOY.md).

1. Use the configured D1 database `orbit-db`. For another account, update the account/database IDs in `wrangler.json`.
2. Connect this GitHub repository to a Cloudflare **Worker**, not a Pages static project.
3. Set the build command to `npm run build` and the deploy command to `npm run deploy`. The build token needs D1 Edit permission for migrations.
4. Configure Cloudflare Access for the entire Worker hostname, enable email PIN login, and allow the owner's email initially.
5. In the Worker's runtime variables set `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, and `ORBIT_OWNER_EMAIL`.
6. Open the URL and create the workspace as the configured owner.
7. Add each teammate in Orbit and in the Cloudflare Access allow policy.

The deploy script applies pending schema migrations before publishing the built Worker. The app rejects requests while Access configuration is missing and validates the JWT signature, issuer, audience, expiry, and person identity on every production request. It does not trust incoming application identity headers. Static assets also pass through the Worker. Preview URLs are disabled by default.

Runtime variables are managed in the Cloudflare dashboard; `keep_vars` preserves them across deployments. Never commit tokens, `.dev.vars`, `.env`, local databases, or authentication cookies. The `.openai/hosting.json` file is retained only as historical metadata and is not used by the Cloudflare build.

## Team permissions

Only `ORBIT_OWNER_EMAIL` can create an empty workspace. Once provisioned, the owner can add/remove/restore team members, rename the workspace, and delete projects. Admitted members share all projects and can work on tasks and comments. Membership removal blocks app access, unassigns tasks, and preserves comment history. Remove that email from Access as well when revoking platform access.

## Limits of this version

One workspace per deployment. No billing, SSO management UI, file uploads, recurring tasks, automated workflows, private per-project permissions, or real-time push. Views refresh every 30 seconds. The timeline uses a four-week window. JSON/CSV exports are supported; restoration is not implemented.

This project uses original branding and contains no Asana source code or proprietary assets.
