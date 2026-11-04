import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import { createServer, type Server } from "node:http";
import { pool } from "../server/db";
import { storage } from "../server/storage";
import { hashPassword } from "../server/auth";
import { registerRoutes } from "../server/routes";
import { registerAgents } from "../server/reign-agents";
let server: Server,
  base: string,
  admin: string,
  employee: string,
  contactId: number,
  otherId: number,
  key: string,
  keyId: string,
  deal: any,
  project: any,
  task: any,
  proposal: any,
  modelRequest: any,
  toolCalls: any[] = [],
  providerCalls = 0;
const inference = (() => ({
  chat: {
    completions: {
      create: async (input: any) => {
        providerCalls++;
        modelRequest = input;
        return {
          choices: [
            {
              message: {
                content: "Current CRM records reviewed; no changes executed.",
                tool_calls: toolCalls,
              },
            },
          ],
        };
      },
    },
  },
})) as any;
async function call(
  path: string,
  body?: unknown,
  cookie = admin,
  method = body === undefined ? "GET" : "POST",
  token?: string,
) {
  const r = await fetch(base + path, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: r.status,
    data: await r.json().catch(() => null),
    cookie: r.headers.get("set-cookie")?.split(";")[0] || "",
  };
}
before(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test"))
    throw Error("A dedicated *_test database is required");
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM_EMAIL;
  delete process.env.REPL_IDENTITY;
  delete process.env.WEB_REPL_RENEWAL;
  const passwordHash = await hashPassword("CRM-local-QA-password");
  await storage.createUser({
    name: "CRM Admin",
    email: "crm-admin@test.invalid",
    role: "admin",
    passwordHash,
  });
  await storage.createUser({
    name: "CRM Employee",
    email: "crm-employee@test.invalid",
    role: "editor",
    passwordHash,
  });
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  server = createServer(app);
  registerAgents(app, inference);
  await registerRoutes(server, app);
  app.use((err: any, _req: any, res: any, _next: any) =>
    res.status(err.status || 500).json({ message: "Request failed" }),
  );
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = "http://127.0.0.1:" + (server.address() as any).port;
  admin = (
    await call(
      "/api/auth/login",
      { email: "crm-admin@test.invalid", password: "CRM-local-QA-password" },
      "",
    )
  ).cookie;
  employee = (
    await call(
      "/api/auth/login",
      { email: "crm-employee@test.invalid", password: "CRM-local-QA-password" },
      "",
    )
  ).cookie;
  assert.ok(admin && employee);
});
after(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await pool.end();
});
test("CRM is employee-authenticated and integration administration stays admin-only", async () => {
  assert.equal((await call("/api/crm/contacts", undefined, "")).status, 401);
  assert.equal(
    (await call("/api/crm/integrations", undefined, employee)).status,
    403,
  );
  assert.equal(
    (await call("/api/crm/integrations", { name: "Forbidden" }, employee))
      .status,
    403,
  );
  assert.equal((await call("/api/crm/ingest/leads", {}, "")).status, 401);
});
test("Manual entry supports phone-only clients, strict validation, ownership and linked contact updates", async () => {
  assert.equal(
    (await call("/api/crm/contacts", { name: "No contact details" }, employee))
      .status,
    400,
  );
  const r = await call(
    "/api/crm/contacts",
    {
      name: "CRM Synthetic Client",
      phone: "555-0109",
      project: "Patio renovation",
      company: "QA Company",
      contactType: "client",
      nextFollowUpAt: "2026-01-01T10:00:00Z",
    },
    employee,
  );
  assert.equal(r.status, 201);
  contactId = r.data.id;
  assert.equal(r.data.contact_type, "client");
  assert.equal(r.data.utm_source, "manual");
  assert.equal(r.data.email, "");
  assert.equal(
    (
      await call(
        "/api/crm/contacts",
        { name: "Forged assignment", phone: "555", assignedTo: 99999999 },
        employee,
      )
    ).status,
    400,
  );
  const edit = await call(
    "/api/crm/contacts/" + contactId,
    {
      name: "CRM Updated Client",
      email: "qa@example.invalid",
      phone: "555-0109",
      project: "Patio",
      contactType: "client",
      address: "QA test address",
      nextFollowUpAt: null,
    },
    employee,
    "PATCH",
  );
  assert.equal(edit.status, 200);
  assert.equal(edit.data.id, contactId);
  assert.equal(edit.data.next_follow_up_at, null);
});
test("Public form enquiries appear immediately in CRM without a duplicate contact migration", async () => {
  const r = await call(
    "/api/leads",
    {
      name: "Website CRM QA",
      email: "website@test.invalid",
      phone: "555",
      vehicle: "Roof",
      message: "Test enquiry",
    },
    "",
  );
  assert.equal(r.status, 201);
  otherId = r.data.id;
  const rows = (await call("/api/crm/contacts", undefined, employee)).data;
  assert.equal(rows.filter((c: any) => c.id === otherId).length, 1);
  const profile = (
    await call("/api/crm/contacts/" + otherId, undefined, employee)
  ).data;
  assert.equal(profile.contact.contact_type, "lead");
  assert.equal(profile.proposals.length, 0);
  assert.equal(
    (
      await pool.query("SELECT * FROM reign_crm_profiles WHERE lead_id=$1", [
        otherId,
      ])
    ).rowCount,
    0,
  );
});
test("Calls, notes and follow-up dates persist as activity without sending external email", async () => {
  const r = await call(
    "/api/crm/contacts/" + contactId + "/activities",
    {
      kind: "email",
      subject: "Logged prior conversation",
      body: "QA note only; do not send.",
      outcome: "Site visit requested",
      nextFollowUpAt: "2026-01-02T09:00:00Z",
    },
    employee,
  );
  assert.equal(r.status, 201);
  const d = (await call("/api/crm/contacts/" + contactId, undefined, employee))
    .data;
  assert.equal(d.activities[0].kind, "email");
  assert.equal(d.activities[0].subject, "Logged prior conversation");
  assert.ok(d.contact.next_follow_up_at);
  assert.equal(
    (
      await call(
        "/api/crm/contacts/" + contactId + "/activities",
        { kind: "sms", subject: "Invalid" },
        employee,
      )
    ).status,
    400,
  );
});
test("Deal stages and project budgets retain zero/null meaning and reject stale edits", async () => {
  let r = await call(
    "/api/crm/deals",
    {
      leadId: contactId,
      title: "QA patio opportunity",
      valueCents: 125000,
      stage: "qualified",
    },
    employee,
  );
  assert.equal(r.status, 201);
  deal = r.data;
  const data = {
    leadId: contactId,
    title: deal.title,
    valueCents: 125000,
    stage: "proposal",
  };
  r = await call(
    "/api/crm/deals/" + deal.id,
    { version: deal.version, data },
    employee,
    "PATCH",
  );
  assert.equal(r.status, 200);
  assert.equal(
    (
      await call(
        "/api/crm/deals/" + deal.id,
        { version: deal.version, data },
        employee,
        "PATCH",
      )
    ).status,
    409,
  );
  assert.equal(
    (await call("/api/crm/deals", { ...data, valueCents: -1 }, employee))
      .status,
    400,
  );
  assert.equal(
    (
      await call(
        "/api/crm/projects",
        {
          leadId: contactId,
          title: "Bad dates",
          startDate: "2026-11-10",
          dueDate: "2026-11-01",
        },
        employee,
      )
    ).status,
    400,
  );
  r = await call(
    "/api/crm/projects",
    {
      leadId: contactId,
      title: "QA Patio Build",
      stage: "in_progress",
      budgetCents: 0,
      spentCents: null,
      dueDate: "2026-12-01",
    },
    employee,
  );
  assert.equal(r.status, 201);
  project = r.data;
  assert.equal(Number(project.budget_cents), 0);
  assert.equal(project.spent_cents, null);
});
test("Assigned task completion drives reproducible project progress and workload metrics", async () => {
  const team = (await call("/api/crm/team", undefined, employee)).data;
  const assignee = team.find((t: any) => t.name === "CRM Employee").id;
  let r = await call(
    "/api/crm/projects/" + project.id + "/tasks",
    {
      title: "QA site visit",
      priority: "high",
      assignedTo: assignee,
      dueDate: "2026-01-01",
    },
    employee,
  );
  assert.equal(r.status, 201);
  task = r.data;
  r = await call(
    "/api/crm/tasks/" + task.id,
    {
      version: task.version,
      data: {
        title: task.title,
        status: "complete",
        priority: "high",
        assignedTo: assignee,
        dueDate: "2026-01-01",
      },
    },
    employee,
    "PATCH",
  );
  assert.equal(r.status, 200);
  assert.equal(
    (
      await call(
        "/api/crm/tasks/" + task.id,
        {
          version: task.version,
          data: { title: task.title, status: "pending" },
        },
        employee,
        "PATCH",
      )
    ).status,
    409,
  );
  const summary = (await call("/api/crm/overview", undefined, employee)).data;
  const p = summary.projects.find((p: any) => p.id === project.id);
  assert.equal(p.task_count, 1);
  assert.equal(p.complete_tasks, 1);
  assert.ok(
    summary.workload.some(
      (w: any) => w.name === "CRM Employee" && w.complete >= 1,
    ),
  );
  assert.ok(summary.contacts.overdue_followups >= 1);
  assert.ok(
    summary.deals.some(
      (d: any) => d.stage === "proposal" && Number(d.value_cents) >= 125000,
    ),
  );
});
test("Workflow keys are scoped, retry-safe under concurrency, conflict-detecting and immediately revocable", async () => {
  const r = await call("/api/crm/integrations", { name: "QA workflow" });
  assert.equal(r.status, 201);
  key = r.data.token;
  keyId = r.data.id;
  const body = {
    eventId: "crm-event-one",
    contact: {
      name: "CRM integration lead",
      email: "integration@example.invalid",
      project: "Deck",
    },
  };
  const results = await Promise.all([
    call("/api/crm/ingest/leads", body, "", "POST", key),
    call("/api/crm/ingest/leads", body, "", "POST", key),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 201]);
  assert.equal(results[0].data.leadId, results[1].data.leadId);
  assert.equal(
    (
      await pool.query(
        "SELECT * FROM reign_crm_ingestion WHERE key_id=$1 AND event_id='crm-event-one'",
        [keyId],
      )
    ).rowCount,
    1,
  );
  assert.equal(
    (
      await call(
        "/api/crm/ingest/leads",
        { ...body, contact: { ...body.contact, name: "Changed" } },
        "",
        "POST",
        key,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await call(
        "/api/crm/contacts/" + contactId + "/activities",
        { kind: "note", subject: "Key may not write activity" },
        "",
        "POST",
        key,
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await call(
        "/api/crm/ingest/leads",
        {
          eventId: "assign",
          contact: { name: "X", phone: "555", assignedTo: 1 },
        },
        "",
        "POST",
        key,
      )
    ).status,
    400,
  );
  const listed = (await call("/api/crm/integrations")).data.find(
    (k: any) => k.id === keyId,
  );
  assert.equal(listed.token, undefined);
  assert.equal(listed.token_hash, undefined);
  assert.equal(
    (await call("/api/crm/integrations/" + keyId, undefined, admin, "DELETE"))
      .status,
    204,
  );
  assert.equal(
    (await call("/api/crm/ingest/leads", body, "", "POST", key)).status,
    401,
  );
});
test("Employees can draft estimates, but cannot change CMS/pricing or issue customer proposals", async () => {
  const service = await storage.createService({
    title: "CRM Turf QA",
    slug: "crm-turf-qa",
    description: "Synthetic",
    isActive: true,
  });
  const card = {
    type: "rates.set",
    rates: [
      {
        serviceId: service.id,
        unit: "sq ft",
        unitPriceCents: 1000,
        minimumCents: 0,
      },
    ],
  };
  assert.equal(
    (await call("/api/operations/actions", card, employee)).status,
    403,
  );
  assert.equal((await call("/api/operations/actions", card)).status, 201);
  const body = {
    type: "proposal.create",
    data: {
      leadId: contactId,
      title: "CRM QA Estimate",
      scope: "Synthetic 10 sq ft test scope; no customer bid.",
      lines: [{ serviceId: service.id, quantity: 10 }],
      taxBasisPoints: 0,
    },
  };
  const r = await call("/api/operations/actions", body, employee);
  assert.equal(r.status, 201);
  proposal = r.data;
  assert.equal(proposal.document.totalCents, 10000);
  assert.equal(
    (
      await call(
        "/api/operations/proposals/" + proposal.id + "/issue",
        { version: proposal.version },
        employee,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        "/api/operations/actions",
        { type: "service.delete", id: service.id },
        employee,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call("/api/operations/proposals/" + proposal.id + "/issue", {
        version: proposal.version,
      })
    ).status,
    200,
  );
});
test("Portal invitations revoke earlier links, keep secrets out of profiles, and do not fake email delivery", async () => {
  let r = await call(
    "/api/crm/contacts/" + contactId + "/invite",
    { delivery: "link" },
    employee,
  );
  assert.equal(r.status, 201);
  const first = r.data.url.split("#")[1];
  assert.equal(first.length, 64);
  const second = await call(
    "/api/crm/contacts/" + contactId + "/invite",
    { delivery: "link" },
    employee,
  );
  assert.equal(second.status, 201);
  assert.notEqual(second.data.url, r.data.url);
  assert.equal(
    (await call("/api/portal/session", { token: first }, "")).status,
    401,
  );
  const access = await call(
    "/api/portal/session",
    { token: second.data.url.split("#")[1] },
    "",
  );
  assert.equal(access.status, 200);
  const portal = (await call("/api/portal/me", undefined, access.cookie)).data;
  assert.equal(portal.customer.name, "CRM Updated Client");
  assert.equal(portal.proposals.length, 1);
  assert.equal(portal.proposals[0].id, proposal.id);
  const detail = (
    await call("/api/crm/contacts/" + contactId, undefined, employee)
  ).data;
  assert.ok(detail.portal.expires_at);
  assert.equal(detail.portal.token_hash, undefined);
  assert.equal(detail.portal.url, undefined);
  assert.equal(
    (
      await call(
        "/api/crm/contacts/" + contactId + "/invite",
        { delivery: "email" },
        employee,
      )
    ).status,
    503,
  );
  assert.equal(
    (await call("/api/portal/me", undefined, access.cookie)).status,
    200,
  );
});
test("Employee assistant sees live CRM context and exposes only its permitted action tools", async () => {
  const r = await call(
    "/api/operations/agent",
    { messages: [{ role: "user", content: "What needs a follow up?" }] },
    employee,
  );
  assert.equal(r.status, 200);
  assert.equal(providerCalls, 1);
  const names = modelRequest.tools.map((t: any) => t.function.name);
  assert.ok(names.includes("create_proposal"));
  assert.ok(!names.includes("set_rates"));
  assert.ok(!names.includes("delete_service"));
  assert.ok(modelRequest.messages[0].content.includes("QA patio opportunity"));
  assert.ok(modelRequest.messages[0].content.includes("QA Patio Build"));
  toolCalls = [
    {
      type: "function",
      id: "forbidden-tool",
      function: { name: "set_rates", arguments: JSON.stringify({ rates: [] }) },
    },
  ];
  assert.equal(
    (
      await call(
        "/api/operations/agent",
        { messages: [{ role: "user", content: "Change all pricing" }] },
        employee,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT * FROM reign_agent_actions WHERE action->>'type'='rates.set' AND actor_id=(SELECT id FROM users WHERE email='crm-employee@test.invalid')",
      )
    ).rowCount,
    0,
  );
});

test("Assistant history accepts long replies while bounding human input", async () => {
 toolCalls=[];
 assert.equal((await call("/api/operations/agent",{messages:[{role:"assistant",content:"a".repeat(4000)},{role:"user",content:"What is next?"}]},employee)).status,200);
 assert.equal((await call("/api/operations/agent",{messages:[{role:"user",content:"a".repeat(3001)}]},employee)).status,400);
});
