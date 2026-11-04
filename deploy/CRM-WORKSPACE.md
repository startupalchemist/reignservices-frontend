# Reign construction workspace and CRM

This release extends the existing contractor tools. The authenticated `/admin` workspace replaces the automotive Dyno presentation with construction operations. Public pages retain their existing design. Old `#dyno`, `#leads`, and `#operations` bookmarks resolve to the new overview, contacts and proposals views.

## Data and workflows

The existing `leads` table remains the contact source of truth. Manual entry and scoped integrations write into that same table; website forms appear immediately without importing or duplicating old leads. Migration `0003_reign_crm.sql` adds contact metadata, interactions, deals, projects, tasks and scoped ingestion credentials. Operational SQL migrations are authoritative; do not use `drizzle-kit push` to deploy these tables.

Contacts support lead/client classification, company/property details, staff ownership, interaction history and follow-up timestamps. Logging an email is a historical entry and does not send email. Deals have explicit pipeline stages and USD opportunity values. Projects have optional approved budgets and recorded spend, owners, dates and task lists. Updates to deals, projects and tasks use version checks to prevent overwriting concurrent edits.

Workspace records refresh every 60 seconds while active and refresh on focus when stale; the overview also offers manual refresh. Overview figures derive from persisted records. Pipeline value is an opportunity, and proposal value is not realized revenue. Project progress is completed recorded tasks divided by all recorded tasks; a project without tasks has no measurable task progress. Missing budgets/spend remain missing, not zero. Date-only deadlines display as calendar dates; follow-ups display as timestamps in the viewer's timezone. Lists cap contacts/deals at 2,000 and projects at 1,000; overview totals use the stored data.

The proposal workspace supports multiple lines, approved rates, verified measurement references, scope, tax, document preview/print, explicit admin issue/withdraw and private portal decisions. Issued snapshots remain frozen. Aerial/AI site plans, boundary calculations, saved measurements and existing CMS/integrations are retained.

## Permissions and assistant

Root/admin can manage the CRM, approved pricing, CMS, integration keys and proposal issue/withdraw. Employees (`editor`) can use CRM, project/task tracking, measurements and draft proposals. They cannot manage keys, users, pricing, tenant branding, destructive site-plan deletion or proposal issuance. These restrictions are enforced by server routes and assistant action execution, not only navigation.

The employee assistant reads current CRM/project records and the existing CMS/pricing/proposal/measurement graph. Recent record context is limited to 50 records per category; this is not a complete portfolio analysis. It can prepare validated draft proposals and measurements for the same user's explicit confirmation. Administrators retain their existing CMS tools. The assistant cannot issue customer bids, verify field measurements, send messages or change users. Prepared changes are actor-bound, expire, reject stale context and execute at most once. The UI renders requested changes in business language. OpenRouter remains free-only with bounded fallback; missing/free-provider quotas produce an honest failure, not a paid fallback.

## Incoming workflows (Zapier, Make or another HTTP client)

An admin opens Integrations → Incoming CRM workflows, creates a named credential, copies it once into the workflow's secure credential store and sends HTTPS POST requests to `/api/crm/ingest/leads` with `Authorization: Bearer <credential>` and JSON:

```json
{
  "eventId": "your-source-stable-event-id",
  "contact": {
    "name": "Customer name",
    "email": "customer@example.com",
    "phone": "",
    "project": "Patio consultation",
    "company": "",
    "address": "",
    "contactType": "lead",
    "message": "Customer-supplied project context"
  }
}
```

Name plus email or phone is required. Additional fields must match the strict API schema; unknown fields are rejected. Internal staff cannot be assigned through an ingestion key. Keys create contacts only, expire after 90 days and can be revoked by an administrator. Only a token hash is stored. Do not put credentials in query strings. Use one credential per workflow/source.

Response: 201 `{leadId,replayed:false}` for new events; 200 with the same ID and `replayed:true` for an exact retry; 409 if the same event ID contains changed contact data. Concurrent identical events are deduplicated transactionally. Different event IDs intentionally remain separate contacts; email similarity does not silently merge people. Invalid/revoked keys return 401, invalid input 400, and per-key limits 429 (60 requests/minute per process). Retry transient failures with backoff; correct input conflicts instead of changing payloads under the same ID. This is generic HTTP ingestion, not a published native Zapier/Make marketplace connector.

## Customer invitations

Create a private link from the contact profile, or explicitly choose email delivery if Resend is configured for this environment. Links expire after 30 days; reissuing revokes earlier links and portal sessions. The URL fragment is exchanged for an HttpOnly portal cookie, then removed from the address bar. Customer requests are scoped to that contact and omit draft proposals. Do not place portal URLs in logs or tickets.

The app reports provider acceptance separately from delivery. Without email configuration it returns 503 before changing existing access. If the provider rejects a new invitation, the UI offers its newly-created private link and states that older access was revoked. Sending does not imply inbox delivery. Invitations are limited to 20 per staff member/hour per process. QA must use synthetic addresses and, for any actual mail test, only the provider's delivery simulator.

## Validation and release

Run `npm ci`, `npm run check`, `npm test`, migrations against a fresh disposable `*_test` PostgreSQL database, `npm run test:integration`, and `npm run build`. `test:integration` is sequential because suites share service/rate fixtures. Browser QA is `npm run test:browser` with `REIGN_QA_BASE`, `REIGN_QA_OUTPUT` (private directory) and `REIGN_QA_ACCOUNT_FILE` (private array of normal-login admin/root and editor accounts). It only accepts localhost or Reign staging. Browser artifacts and test credentials must not be committed. The browser suite uses an explicitly labeled assistant UI fixture; live free inference is a separate staging check.

Stage the exact reviewed commit using `deploy/compose.staging.yaml`. Preserve the previous immutable app image and take a private staging database backup first. Run the migration service separately with the staging database owner credentials, then update only the staging app. Verify runtime access to new tables and sequences. Check HTTPS health, desktop/mobile login, manual contact, workflow retries/revocation, interaction, deals, projects/tasks, estimates, customer portal, employee restrictions and live assistant. Record image/commit, evidence and synthetic IDs privately. Clean only the exact synthetic test records after verification.

Migration 0003 is additive. To roll back, restore the prior staging app image and leave the new tables/data in place; the prior app ignores them. Do not drop contact or project data or restore an old database over subsequent writes. The backup is for recovery after an incident, not routine app rollback. Production uses separate credentials/database/compose and requires its own explicitly authorized promotion. A main-branch merge does not itself deploy production.
