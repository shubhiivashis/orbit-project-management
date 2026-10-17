# Orbit

An Asana-inspired project management app for one team, with original branding and UI.

## Features

- Workspace onboarding and authenticated team access.
- Projects: create, edit, and owner-confirmed deletion.
- Task board with drag-and-drop, list, calendar, and four-week timeline.
- Task creation, editing and deletion; assignments, priorities, dates, tags, subtasks, and dependencies.
- Comments, team activity, personal tasks, progress dashboard, search, filters, and sorting.
- Owner-managed email membership; pending members can be assigned tasks before joining.
- Shared Cloudflare D1 storage, server-side validation, same-origin write checks, and optimistic task version checks.
- CSV task exports and JSON workspace downloads.
- Responsive interface, keyboard shortcuts (`/` search, `n` new task), labeled forms and keyboard-operable dialogs.

## Local development

Requires Node.js 22.13+ and npm. On Windows use `npm.cmd` if PowerShell blocks npm.ps1.

```sh
npm run install:ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_yummy_chronomancer.sql
npm run dev
```

Open the printed local URL and sign in using the local development sign-in screen. The portable starter simulates `seedy@sites.test` for loopback development only. Create a workspace and optionally load the sample website-redesign project. Local test data lives in ignored `.wrangler/state`; it is not deployed or committed.

```sh
npx tsc --noEmit
node tests/api.smoke.mjs
```

The smoke test requires the local dev server on port 5173 and a workspace owned by the local development account. It creates its own temporary project and cleans it up. It refuses remote URLs.

## Deployment and team onboarding

This app uses Sites hosting, Cloudflare Workers, D1, and the starter's ChatGPT authentication integration. `.openai/hosting.json` stores the existing Site identity and `DB` binding. Preserve the original Site identity when publishing updates. The supported Sites workflow syncs source, packages build output, applies migrations, and publishes a private version.

1. Deploy the app privately, then sign in as its owner and create the workspace.
2. Add teammates by their exact ChatGPT sign-in email under Team members.
3. Separately grant those people access through Site sharing controls.
4. Share the deployed URL yourself. The app does not send invitation emails.

Only the owner can add or remove membership or delete a project. All admitted team members share the projects and can edit tasks and comments. This is one team workspace per deployment; it is not a multi-tenant SaaS.

The production server trusts the authentication headers supplied by Sites dispatch. A standalone deployment must provide a trusted authentication gateway that strips client-supplied identity headers; do not expose the raw Worker as an unauthenticated public origin.

## Product boundaries

This is a working first version, not exhaustive Asana feature parity. It does not include billing, SSO, file attachments, outbound email, recurring tasks, custom automation rules, private per-project permissions, or real-time push. Team views refresh every 30 seconds. The timeline shows a fixed four-week window. The JSON download is an export; restoration is not implemented.

## Structure

- `app/workspace-app.tsx`: client interface and view state.
- `app/api/workspace/route.ts`: authenticated workspace API and validation.
- `db/schema.ts`: Drizzle schema.
- `drizzle/`: committed D1 schema migrations.
- `app/chatgpt-auth.ts`: Sites authentication helpers.
- `build/` and `scripts/`: portable Sites framework/deployment integration.

No Asana source code or proprietary assets are included. This project is independent of Asana.
