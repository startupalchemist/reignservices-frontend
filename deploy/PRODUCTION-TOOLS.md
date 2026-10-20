# Reign operations release

Branch: feat/reign-production-tools, based on the deployed feat/reign-oracle-launch branch.
The repository had no existing Actions workflow, deployment runner, dev branch, or staging environment.
CI now runs type checks, calculation tests, PostgreSQL migrations/integration tests, frontend/server build, and a Docker build.
The existing live production app remains on its prior image until manual promotion.

## Features

- Public sales advisor with a permanent free-consultation CTA. It can explain the active CMS services but cannot book an appointment or mutate staff data.
- Internal assistant reads the current CMS graph, approved pricing, and the most recent 50 leads, proposals, and measurements. It proposes validated changes. The same authenticated admin must confirm each action within ten minutes; stale CMS context and repeated confirmations are rejected. Issuing proposals stays an explicit staff action.
- Live context graph is derived from the database on every request, fingerprinted and linked business → services → rates/consultation. No separate vector/graph service or stale background index is required.
- Approved per-service rate cards, deterministic cents/tax/minimum pricing, frozen proposal snapshots, draft updates, staff issue/withdraw, and customer acceptance/decline with optimistic version checks.
- Property area/perimeter calculations from supplied survey/scaled-drawing boundary coordinates. Geometry is validated and staff verification is required before using a saved measurement in a proposal. This is not address-only aerial measurement; no imagery or parcel provider is configured.
- Private customer links expire after 30 days. Only token hashes are stored. The token travels in the URL fragment, is removed immediately, then used in an HttpOnly portal cookie. Reissuing a link revokes previous links and sessions. Customer queries are scoped by lead ID and omit drafts.
- Anonymous blog access is restricted to published posts. Staff can preview drafts. Publication metadata, tracking links, and a newsletter draft commit together. Newsletter sending is reviewed separately. Provider rejections are not counted as successes; concurrent/repeated sends are blocked. Partial or interrupted sends require provider-log review instead of an automatic resend.
- Staff mutation events are recorded in reign_audit. No credentials are stored in Git.

## Inference configuration

Set OPENROUTER_API_KEY outside Git, OPENROUTER_MODEL=openrouter/free, AI_DAILY_REQUEST_LIMIT=40, PUBLIC_BASE_URL to the environment's HTTPS origin.
Only openrouter/free or an explicit :free model is accepted; the wrapper rejects any other requested model. There is no paid fallback. A busy pinned free model receives at most one retry through openrouter/free; both attempts count against the app budget.
OpenRouter free availability/latency and account quotas are external limits. The public advisor degrades to a consultation CTA on errors; staff generation reports failure instead of pretending a mutation or article succeeded.
Long-form generation has a three-minute request timeout; interactive chat keeps its shorter timeout. Staging uses the live-tested cohere/north-mini-code:free model, with a bounded openrouter/free fallback. Model availability can change.
Provider documentation: https://openrouter.ai/docs/guides/routing/routers/free-router and https://openrouter.ai/docs/api_reference/limits
A missing key does not break normal CMS, proposals, portal, or lead intake.

## Staging

Use a separate PostgreSQL volume and environment files, not a copy of production credentials or customer records:
REIGN_IMAGE=<tested-tag> docker compose -f deploy/compose.staging.yaml up -d postgres
REIGN_IMAGE=<tested-tag> docker compose -f deploy/compose.staging.yaml --profile tools run --rm migrate
REIGN_IMAGE=<tested-tag> docker compose -f deploy/compose.staging.yaml up -d app

The staging API is Oracle loopback:5001, through a supervised Starlight loopback:5402 tunnel.
The intended HTTPS staging host is reign-staging.209-74-71-35.sslip.io with noindex/nofollow headers.
Seed test accounts and synthetic data only. Remove ROOT_PASSWORD from the app environment after bootstrap.

## Manual production promotion

1. Confirm the PR's CI checks, ARM64 Docker build, staging UI/API journeys, live OpenRouter structured generation, and mail configuration/delivery checks pass. Review the real service rate card and tax applicability before issuing customer bids.
2. Pin the approved image by immutable commit tag/digest. Keep the prior production image and environment file for rollback.
3. Trigger the encrypted Oracle backup and offhost pull; verify both succeed.
4. Install the reviewed source/migrations separately from the running app. Run script/migrate.cjs using the existing reign_services_migrate credentials on txl-core_data.
5. Start the approved image using the restricted reign_services_app role and the production environment at Oracle loopback:5000. Do not use staging DB credentials.
6. Verify /healthz, both requested staff roles, lead intake, draft privacy, CMS, a synthetic proposal/customer portal, and provider health over the production HTTPS origin. Clean only exact synthetic test records.
7. Roll back the app image if checks fail. Migration 0001 is additive; do not drop operational tables or customer records to roll back an app image.
8. Keep main/dev/staging changes in reviewed branches. No production auto-promotion is configured or implied.

## Validation on isolated staging

- Both requested staff accounts log in with the expected roles; production account creation was verified separately.
- TypeScript, nine domain tests and eleven PostgreSQL/API integration tests pass. GitHub CI also builds the full Docker image.
- Desktop (1440 × 1000) and mobile (390 × 844): staff login, approved test rate, boundary calculation/verification, draft bid, issue, private customer link, and customer acceptance. No horizontal overflow or browser page errors in these checked journeys.
- Real free inference: public consultation advisor, a staff-created inactive service, confirmed one-time execution, immediate CMS context refresh, and a valid long-form draft article. Staff function calls also generated a draft bid with the expected test total.
- Full real blog pipeline passed: research returned five topics, the writer generated a queued article, anonymous preview was denied, publication made it readable and created one newsletter draft, and repeated publication created no duplicate draft. The synthetic public post was removed. Browser rendering and unsafe-link blocking also passed. No subscriber mailing was triggered.
- Domain-restricted staging mail credentials are stored outside Git. One message was sent exclusively to the provider's delivery simulator; the provider reported delivered. Repeat sending was rejected. No real customer recipients were contacted.
- Synthetic records and a separate staging database were used. Real business pricing and customer imagery were not inferred.

## Remaining release gates

- Configure the verified OpenRouter credentials on production during manual promotion. Free provider availability and account quotas remain external dependencies; there is no production availability guarantee from a free inference route.
- Production mail needs its own domain-restricted sending key and sender environment. The verified sender domain and staging simulator test do not prove inbox placement for every customer.
- Staff must supply real approved service rates and applicable tax settings before customer bids are issued.
- Address-only automatic property measurements need an imagery/parcel provider, account access, accuracy review, and integration.
- These tests establish the checked journeys, not a guarantee that every input/browser/integration is defect-free.
