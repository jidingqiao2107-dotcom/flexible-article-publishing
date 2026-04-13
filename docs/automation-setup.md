# Manager GPT Automation Setup

This project uses GitHub as the event hub and exposes a read-only task center API for a manager GPT.

## Runtime Variables

Create `.env.local` with these values:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/route_a_authoring"
GITHUB_WEBHOOK_SECRET="replace-with-a-long-random-secret"
MANAGER_GPT_API_KEY="replace-with-a-long-random-api-key"
GITHUB_REPOSITORY_ALLOWLIST="owner/repo"
```

`GITHUB_REPOSITORY_ALLOWLIST` is optional. If it is set, webhook events from repositories outside the comma-separated list are rejected.

## Database

Apply the updated Prisma schema before using the webhook:

```bash
npm run prisma:generate
npm run prisma:migrate
```

For disposable local validation, use the existing test database:

```bash
docker compose up -d postgres-test
$env:TEST_DATABASE_URL="postgresql://route_a:route_a_password@localhost:54329/route_a_authoring_test"
npm run validate:persistence
```

## GitHub Webhook

Set the webhook URL to:

```text
https://YOUR-DEPLOYMENT-URL/api/integrations/github/webhook
```

Use `application/json` payloads and set the secret to the same value as `GITHUB_WEBHOOK_SECRET`.

Subscribe to these events:

- Pushes
- Pull requests
- Pull request reviews
- Workflow runs
- Issue comments, optional

The webhook verifies `X-Hub-Signature-256`, ignores duplicate `X-GitHub-Delivery` IDs, and writes normalized items into `TaskCenterItem`.

## Manager GPT Action

Import `public/openapi/task-center.json` into GPT Builder Actions and replace:

```text
https://YOUR-DEPLOYMENT-URL
```

with the deployed domain.

Use Bearer authentication and set the token to `MANAGER_GPT_API_KEY`.

Suggested manager GPT instructions:

```text
You are the R&D manager for the Route A project.
Before answering roadmap, delivery, architecture, or engineering-status questions, call the task-center action.
Summarize the latest tasks by priority:
1. failed or cancelled items
2. PRs awaiting review
3. in-progress branch updates
Always connect your recommendation to the repository state shown by the action results.
If data is missing, say what signal is missing.
```
