import type { Express, RequestHandler } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { pool } from "./db";
import { authMiddleware, requireRole } from "./auth";
import { handled, fail, audit, createPortalAccess } from "./reign-operations";
import { getResendClient } from "./resend";
import { requireEmailAccepted } from "./mail-result";
const staff = [authMiddleware, requireRole("root", "admin", "editor")];
const admins = [authMiddleware, requireRole("root", "admin")];
const id = z.coerce.number().int().positive().safe();
const text = (max = 300) => z.string().trim().max(max);
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Invalid date",
  )
  .nullable();
const stamp = z.string().datetime({ offset: true }).nullable();
const cents = z.number().int().min(0).max(1000000000000);
const contactInput = z
  .object({
    name: text(200).min(1),
    email: z
      .union([z.string().trim().email().max(254), z.literal("")])
      .default(""),
    phone: text(60).default(""),
    project: text(300).default(""),
    company: text(300).default(""),
    address: text(1000).default(""),
    contactType: z.enum(["lead", "client"]).default("lead"),
    assignedTo: id.nullable().default(null),
    nextFollowUpAt: stamp.default(null),
    message: text(8000).default(""),
  })
  .strict()
  .refine(
    (v) => Boolean(v.email || v.phone),
    "Add an email address or phone number",
  );
const dealInput = z
  .object({
    leadId: id,
    title: text(300).min(1),
    stage: z
      .enum([
        "new",
        "qualified",
        "assessment",
        "proposal",
        "negotiation",
        "won",
        "lost",
      ])
      .default("new"),
    valueCents: cents.default(0),
    assignedTo: id.nullable().default(null),
    expectedClose: day.default(null),
    notes: text(8000).default(""),
  })
  .strict();
const projectInput = z
  .object({
    leadId: id,
    title: text(300).min(1),
    stage: z
      .enum(["planning", "in_progress", "on_hold", "complete"])
      .default("planning"),
    budgetCents: cents.nullable().default(null),
    spentCents: cents.nullable().default(null),
    startDate: day.default(null),
    dueDate: day.default(null),
    assignedTo: id.nullable().default(null),
    notes: text(8000).default(""),
  })
  .strict()
  .refine(
    (v) => !v.startDate || !v.dueDate || v.dueDate >= v.startDate,
    "Due date must follow start date",
  );
const taskInput = z
  .object({
    title: text(300).min(1),
    status: z.enum(["pending", "in_progress", "complete"]).default("pending"),
    priority: z.enum(["low", "medium", "high"]).default("medium"),
    assignedTo: id.nullable().default(null),
    dueDate: day.default(null),
  })
  .strict();
const digest = (v: string) =>
  crypto.createHash("sha256").update(v).digest("hex");
const contactSelect =
  "SELECT l.*,COALESCE(p.contact_type,'lead') contact_type,COALESCE(p.company,'') company,COALESCE(p.address,'') address,p.assigned_to,p.next_follow_up_at,u.name owner_name FROM leads l LEFT JOIN reign_crm_profiles p ON p.lead_id=l.id LEFT JOIN users u ON u.id=p.assigned_to";
async function contact(leadId: number, client: any = pool) {
  const row = (await client.query(contactSelect + " WHERE l.id=$1", [leadId]))
    .rows[0];
  if (!row) fail("Contact not found", 404);
  return row;
}
async function owner(userId: number | null) {
  if (
    userId !== null &&
    !(
      await pool.query(
        "SELECT id FROM users WHERE id=$1 AND role IN ('root','admin','editor')",
        [userId],
      )
    ).rowCount
  )
    fail("Choose an existing team member");
}
async function createContact(
  client: any,
  data: z.infer<typeof contactInput>,
  source: string,
) {
  const lead = (
    await client.query(
      "INSERT INTO leads(name,email,phone,vehicle,message,utm_source) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
      [
        data.name,
        data.email.toLowerCase(),
        data.phone,
        data.project,
        data.message,
        source,
      ],
    )
  ).rows[0];
  await client.query(
    "INSERT INTO reign_crm_profiles(lead_id,contact_type,company,address,assigned_to,next_follow_up_at) VALUES($1,$2,$3,$4,$5,$6)",
    [
      lead.id,
      data.contactType,
      data.company,
      data.address,
      data.assignedTo,
      data.nextFollowUpAt,
    ],
  );
  return lead;
}
async function transaction<T>(fn: (client: any) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await fn(client);
    await client.query("COMMIT");
    return r;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
export function registerCRM(
  app: Express,
  onLeadCreated: (event: string, payload: Record<string, any>) => Promise<void>,
) {
  app.use("/api/crm", (_req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    next();
  });
  app.get(
    "/api/crm/team",
    ...staff,
    handled(async (_req, res) =>
      res.json(
        (await pool.query("SELECT id,name,role FROM users ORDER BY name")).rows,
      ),
    ),
  );
  app.get(
    "/api/crm/contacts",
    ...staff,
    handled(async (_req, res) =>
      res.json(
        (await pool.query(contactSelect + " ORDER BY l.id DESC LIMIT 2000"))
          .rows,
      ),
    ),
  );
  app.post(
    "/api/crm/contacts",
    ...staff,
    handled(async (req, res) => {
      const data = contactInput.parse(req.body);
      await owner(data.assignedTo);
      const lead = await transaction((c) => createContact(c, data, "manual"));
      await audit(req.user!.id, "crm.contact.create", String(lead.id));
      res.status(201).json(await contact(lead.id));
      void onLeadCreated("lead.created", {
        id: lead.id,
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        vehicle: lead.vehicle,
        source: "manual",
      });
    }),
  );
  app.patch(
    "/api/crm/contacts/:id",
    ...staff,
    handled(async (req, res) => {
      const leadId = id.parse(req.params.id),
        data = contactInput.parse(req.body);
      await contact(leadId);
      await owner(data.assignedTo);
      await transaction(async (c) => {
        await c.query(
          "UPDATE leads SET name=$1,email=$2,phone=$3,vehicle=$4,message=$5 WHERE id=$6",
          [
            data.name,
            data.email.toLowerCase(),
            data.phone,
            data.project,
            data.message,
            leadId,
          ],
        );
        await c.query(
          "INSERT INTO reign_crm_profiles(lead_id,contact_type,company,address,assigned_to,next_follow_up_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(lead_id) DO UPDATE SET contact_type=excluded.contact_type,company=excluded.company,address=excluded.address,assigned_to=excluded.assigned_to,next_follow_up_at=excluded.next_follow_up_at,updated_at=now()",
          [
            leadId,
            data.contactType,
            data.company,
            data.address,
            data.assignedTo,
            data.nextFollowUpAt,
          ],
        );
      });
      await audit(req.user!.id, "crm.contact.update", String(leadId));
      res.json(await contact(leadId));
    }),
  );
  app.get(
    "/api/crm/contacts/:id",
    ...staff,
    handled(async (req, res) => {
      const leadId = id.parse(req.params.id),
        c = await contact(leadId);
      const [activities, deals, projects, proposals, measurements, portal] =
        await Promise.all([
          pool.query(
            "SELECT a.*,u.name author_name FROM reign_contact_activity a LEFT JOIN users u ON u.id=a.created_by WHERE lead_id=$1 ORDER BY a.created_at DESC LIMIT 200",
            [leadId],
          ),
          pool.query(
            "SELECT * FROM reign_deals WHERE lead_id=$1 ORDER BY id DESC",
            [leadId],
          ),
          pool.query(
            "SELECT * FROM reign_projects WHERE lead_id=$1 ORDER BY id DESC",
            [leadId],
          ),
          pool.query(
            "SELECT id,document,status,version,updated_at FROM reign_proposals WHERE lead_id=$1 ORDER BY id DESC",
            [leadId],
          ),
          pool.query(
            "SELECT id,label,area_sq_ft,perimeter_ft,verified FROM reign_measurements WHERE lead_id=$1 ORDER BY id DESC",
            [leadId],
          ),
          pool.query(
            "SELECT expires_at FROM reign_portal_access WHERE lead_id=$1 AND expires_at>now()",
            [leadId],
          ),
        ]);
      res.json({
        contact: c,
        activities: activities.rows,
        deals: deals.rows,
        projects: projects.rows,
        proposals: proposals.rows,
        measurements: measurements.rows,
        portal: portal.rows[0] || null,
      });
    }),
  );
  app.post(
    "/api/crm/contacts/:id/activities",
    ...staff,
    handled(async (req, res) => {
      const leadId = id.parse(req.params.id);
      await contact(leadId);
      const v = z
        .object({
          kind: z.enum(["note", "call", "email", "meeting", "site_visit"]),
          subject: text(300).min(1),
          body: text(8000).default(""),
          outcome: text(1000).default(""),
          nextFollowUpAt: stamp.optional(),
        })
        .strict()
        .parse(req.body);
      const activity = await transaction(async (c) => {
        const r = await c.query(
          "INSERT INTO reign_contact_activity(lead_id,kind,subject,body,outcome,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
          [leadId, v.kind, v.subject, v.body, v.outcome, req.user!.id],
        );
        if (v.nextFollowUpAt !== undefined)
          await c.query(
            "INSERT INTO reign_crm_profiles(lead_id,next_follow_up_at) VALUES($1,$2) ON CONFLICT(lead_id) DO UPDATE SET next_follow_up_at=excluded.next_follow_up_at,updated_at=now()",
            [leadId, v.nextFollowUpAt],
          );
        return r.rows[0];
      });
      await audit(req.user!.id, "crm.activity.log", String(activity.id));
      res.status(201).json(activity);
    }),
  );
  const invitations = new Map<number, { count: number; until: number }>();
  app.post(
    "/api/crm/contacts/:id/invite",
    ...staff,
    handled(async (req, res) => {
      const delivery = z
        .object({ delivery: z.enum(["link", "email"]) })
        .strict()
        .parse(req.body).delivery;
      const leadId = id.parse(req.params.id),
        c = await contact(leadId);
      const now = Date.now();
      for (const [k, v] of invitations)
        if (v.until < now) invitations.delete(k);
      const v = invitations.get(req.user!.id) || {
        count: 0,
        until: now + 3600000,
      };
      if (v.count >= 20)
        fail("Invitation limit reached. Try again later.", 429);
      v.count++;
      invitations.set(req.user!.id, v);
      let mail: Awaited<ReturnType<typeof getResendClient>> | undefined;
      if (delivery === "email") {
        if (!z.string().email().safeParse(c.email).success)
          fail("Add a valid customer email address first");
        try {
          mail = await getResendClient();
        } catch {
          fail(
            "Email delivery is not configured. Use a private invitation link instead.",
            503,
          );
        }
      }
      const access = await createPortalAccess(req.user!.id, leadId);
      if (delivery === "email") {
        try {
          const result = await mail!.client.emails.send({
            from: mail!.fromEmail,
            to: c.email,
            subject: "Your private Reign Services project portal",
            text:
              "Your Reign Services team has invited you to your private customer portal. Review your issued proposals and record your decision here:\n\n" +
              access.url +
              "\n\nThis private link expires in 30 days. Do not forward it. Contact Reign Services if you did not expect this invitation.",
          });
          const providerId = requireEmailAccepted(result);
          await audit(req.user!.id, "portal.invite.email", String(leadId), {
            providerId,
          });
          return res
            .status(201)
            .json({
              ...access,
              delivery: "accepted",
              message: "Invitation accepted by the email provider.",
            });
        } catch {
          return res
            .status(502)
            .json({
              ...access,
              delivery: "failed",
              message:
                "The email provider did not accept the invitation. A new private link was created; copy it below. Previous links were revoked.",
            });
        }
      }
      res.status(201).json({ ...access, delivery: "link" });
    }),
  );
  app.get(
    "/api/crm/deals",
    ...staff,
    handled(async (_req, res) =>
      res.json(
        (
          await pool.query(
            "SELECT d.*,l.name contact_name,u.name owner_name FROM reign_deals d JOIN leads l ON l.id=d.lead_id LEFT JOIN users u ON u.id=d.assigned_to ORDER BY d.updated_at DESC LIMIT 2000",
          )
        ).rows,
      ),
    ),
  );
  app.post(
    "/api/crm/deals",
    ...staff,
    handled(async (req, res) => {
      const d = dealInput.parse(req.body);
      await contact(d.leadId);
      await owner(d.assignedTo);
      const r = (
        await pool.query(
          "INSERT INTO reign_deals(lead_id,title,stage,value_cents,assigned_to,expected_close,notes) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
          [
            d.leadId,
            d.title,
            d.stage,
            d.valueCents,
            d.assignedTo,
            d.expectedClose,
            d.notes,
          ],
        )
      ).rows[0];
      await audit(req.user!.id, "crm.deal.create", String(r.id));
      res.status(201).json(r);
    }),
  );
  app.patch(
    "/api/crm/deals/:id",
    ...staff,
    handled(async (req, res) => {
      const raw = z
          .object({ version: id, data: dealInput })
          .strict()
          .parse(req.body),
        d = raw.data;
      await contact(d.leadId);
      await owner(d.assignedTo);
      const r = (
        await pool.query(
          "UPDATE reign_deals SET lead_id=$1,title=$2,stage=$3,value_cents=$4,assigned_to=$5,expected_close=$6,notes=$7,version=version+1,updated_at=now() WHERE id=$8 AND version=$9 RETURNING *",
          [
            d.leadId,
            d.title,
            d.stage,
            d.valueCents,
            d.assignedTo,
            d.expectedClose,
            d.notes,
            id.parse(req.params.id),
            raw.version,
          ],
        )
      ).rows[0];
      if (!r) fail("Deal changed. Refresh before saving.", 409);
      await audit(req.user!.id, "crm.deal.update", String(r.id));
      res.json(r);
    }),
  );
  app.get(
    "/api/crm/projects",
    ...staff,
    handled(async (_req, res) =>
      res.json(
        (
          await pool.query(
            "SELECT p.*,l.name contact_name,u.name owner_name,COUNT(t.id)::int task_count,COUNT(t.id) FILTER(WHERE t.status='complete')::int complete_tasks FROM reign_projects p JOIN leads l ON l.id=p.lead_id LEFT JOIN users u ON u.id=p.assigned_to LEFT JOIN reign_project_tasks t ON t.project_id=p.id GROUP BY p.id,l.name,u.name ORDER BY p.id DESC LIMIT 1000",
          )
        ).rows,
      ),
    ),
  );
  app.post(
    "/api/crm/projects",
    ...staff,
    handled(async (req, res) => {
      const d = projectInput.parse(req.body);
      await contact(d.leadId);
      await owner(d.assignedTo);
      const r = (
        await pool.query(
          "INSERT INTO reign_projects(lead_id,title,stage,budget_cents,spent_cents,start_date,due_date,assigned_to,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
          [
            d.leadId,
            d.title,
            d.stage,
            d.budgetCents,
            d.spentCents,
            d.startDate,
            d.dueDate,
            d.assignedTo,
            d.notes,
          ],
        )
      ).rows[0];
      await audit(req.user!.id, "crm.project.create", String(r.id));
      res.status(201).json(r);
    }),
  );
  app.patch(
    "/api/crm/projects/:id",
    ...staff,
    handled(async (req, res) => {
      const raw = z
          .object({ version: id, data: projectInput })
          .strict()
          .parse(req.body),
        d = raw.data;
      await contact(d.leadId);
      await owner(d.assignedTo);
      const r = (
        await pool.query(
          "UPDATE reign_projects SET lead_id=$1,title=$2,stage=$3,budget_cents=$4,spent_cents=$5,start_date=$6,due_date=$7,assigned_to=$8,notes=$9,version=version+1,updated_at=now() WHERE id=$10 AND version=$11 RETURNING *",
          [
            d.leadId,
            d.title,
            d.stage,
            d.budgetCents,
            d.spentCents,
            d.startDate,
            d.dueDate,
            d.assignedTo,
            d.notes,
            id.parse(req.params.id),
            raw.version,
          ],
        )
      ).rows[0];
      if (!r) fail("Project changed. Refresh before saving.", 409);
      await audit(req.user!.id, "crm.project.update", String(r.id));
      res.json(r);
    }),
  );
  app.get(
    "/api/crm/projects/:id/tasks",
    ...staff,
    handled(async (req, res) =>
      res.json(
        (
          await pool.query(
            "SELECT t.*,u.name owner_name FROM reign_project_tasks t LEFT JOIN users u ON u.id=t.assigned_to WHERE project_id=$1 ORDER BY due_date NULLS LAST,t.id",
            [id.parse(req.params.id)],
          )
        ).rows,
      ),
    ),
  );
  app.post(
    "/api/crm/projects/:id/tasks",
    ...staff,
    handled(async (req, res) => {
      const projectId = id.parse(req.params.id);
      if (
        !(
          await pool.query("SELECT id FROM reign_projects WHERE id=$1", [
            projectId,
          ])
        ).rowCount
      )
        fail("Project not found", 404);
      const d = taskInput.parse(req.body);
      await owner(d.assignedTo);
      const r = (
        await pool.query(
          "INSERT INTO reign_project_tasks(project_id,title,status,priority,assigned_to,due_date) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
          [projectId, d.title, d.status, d.priority, d.assignedTo, d.dueDate],
        )
      ).rows[0];
      await audit(req.user!.id, "crm.task.create", String(r.id));
      res.status(201).json(r);
    }),
  );
  app.patch(
    "/api/crm/tasks/:id",
    ...staff,
    handled(async (req, res) => {
      const raw = z
          .object({ version: id, data: taskInput })
          .strict()
          .parse(req.body),
        d = raw.data;
      await owner(d.assignedTo);
      const r = (
        await pool.query(
          "UPDATE reign_project_tasks SET title=$1,status=$2,priority=$3,assigned_to=$4,due_date=$5,version=version+1 WHERE id=$6 AND version=$7 RETURNING *",
          [
            d.title,
            d.status,
            d.priority,
            d.assignedTo,
            d.dueDate,
            id.parse(req.params.id),
            raw.version,
          ],
        )
      ).rows[0];
      if (!r) fail("Task changed. Refresh before saving.", 409);
      await audit(req.user!.id, "crm.task.update", String(r.id));
      res.json(r);
    }),
  );
  app.get(
    "/api/crm/overview",
    ...staff,
    handled(async (_req, res) => {
      const [
        contacts,
        deals,
        projects,
        tasks,
        sources,
        proposals,
        activity,
        workload,
      ] = await Promise.all([
        pool.query(
          "SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE p.contact_type='client')::int clients,COUNT(*) FILTER(WHERE p.next_follow_up_at<now())::int overdue_followups FROM leads l LEFT JOIN reign_crm_profiles p ON p.lead_id=l.id",
        ),
        pool.query(
          "SELECT stage,COUNT(*)::int count,COALESCE(SUM(value_cents),0)::text value_cents FROM reign_deals GROUP BY stage",
        ),
        pool.query(
          "SELECT p.*,COUNT(t.id)::int task_count,COUNT(t.id) FILTER(WHERE t.status='complete')::int complete_tasks FROM reign_projects p LEFT JOIN reign_project_tasks t ON t.project_id=p.id GROUP BY p.id ORDER BY p.id DESC",
        ),
        pool.query(
          "SELECT t.*,p.title project_title,u.name owner_name FROM reign_project_tasks t JOIN reign_projects p ON p.id=t.project_id LEFT JOIN users u ON u.id=t.assigned_to WHERE t.status<>'complete' ORDER BY t.due_date NULLS LAST,t.id LIMIT 12",
        ),
        pool.query(
          "SELECT COALESCE(NULLIF(utm_source,''),'Website / direct') source,COUNT(*)::int count FROM leads GROUP BY 1 ORDER BY count DESC LIMIT 12",
        ),
        pool.query(
          "SELECT status,COUNT(*)::int count,COALESCE(SUM((document->>'totalCents')::bigint),0)::text value_cents FROM reign_proposals GROUP BY status",
        ),
        pool.query(
          "SELECT a.id,a.kind,a.subject,a.created_at,l.id lead_id,l.name contact_name FROM reign_contact_activity a JOIN leads l ON l.id=a.lead_id ORDER BY a.created_at DESC LIMIT 8",
        ),
        pool.query(
          "SELECT COALESCE(u.name,'Unassigned') name,COUNT(*) FILTER(WHERE t.status='complete')::int complete,COUNT(*) FILTER(WHERE t.status<>'complete')::int remaining FROM reign_project_tasks t LEFT JOIN users u ON u.id=t.assigned_to GROUP BY 1 ORDER BY remaining DESC",
        ),
      ]);
      res.json({
        contacts: contacts.rows[0],
        deals: deals.rows,
        projects: projects.rows,
        tasks: tasks.rows,
        sources: sources.rows,
        proposals: proposals.rows,
        activity: activity.rows,
        workload: workload.rows,
        asOf: new Date().toISOString(),
      });
    }),
  );
  app.get(
    "/api/crm/integrations",
    ...admins,
    handled(async (_req, res) =>
      res.json(
        (
          await pool.query(
            "SELECT id,name,token_prefix,created_at,expires_at,revoked_at FROM reign_crm_keys ORDER BY created_at DESC",
          )
        ).rows,
      ),
    ),
  );
  app.post(
    "/api/crm/integrations",
    ...admins,
    handled(async (req, res) => {
      const name = z
        .object({ name: text(100).min(1) })
        .strict()
        .parse(req.body).name;
      const token = "rcrm_" + crypto.randomBytes(32).toString("hex"),
        keyId = crypto.randomUUID();
      const row = (
        await pool.query(
          "INSERT INTO reign_crm_keys(id,name,token_hash,token_prefix,created_by,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '90 days') RETURNING id,name,expires_at",
          [keyId, name, digest(token), token.slice(0, 13), req.user!.id],
        )
      ).rows[0];
      await audit(req.user!.id, "crm.integration.create", keyId);
      res.status(201).json({ ...row, token });
    }),
  );
  app.delete(
    "/api/crm/integrations/:id",
    ...admins,
    handled(async (req, res) => {
      const keyId = z.string().uuid().parse(req.params.id);
      await pool.query(
        "UPDATE reign_crm_keys SET revoked_at=now() WHERE id=$1",
        [keyId],
      );
      await audit(req.user!.id, "crm.integration.revoke", keyId);
      res.sendStatus(204);
    }),
  );
  const windows = new Map<string, { n: number; until: number }>();
  app.post(
    "/api/crm/ingest/leads",
    handled(async (req, res) => {
      const match = String(req.headers.authorization || "").match(
        /^Bearer (rcrm_[a-f0-9]{64})$/,
      );
      if (!match) fail("Integration credential required", 401);
      const hash = digest(match[1]),
        key = (
          await pool.query(
            "SELECT id,name FROM reign_crm_keys WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now()",
            [hash],
          )
        ).rows[0];
      if (!key) fail("Integration credential invalid or expired", 401);
      const now = Date.now();
      for (const [k, v] of windows) if (v.until < now) windows.delete(k);
      const w = windows.get(key.id) || { n: 0, until: now + 60000 };
      if (w.n >= 60) fail("Integration rate limit reached", 429);
      w.n++;
      windows.set(key.id, w);
      const input = z
        .object({ eventId: text(160).min(1), contact: contactInput })
        .strict()
        .parse(req.body);
      // Ingestion keys can create contacts only; they cannot choose internal ownership or invoke other modules.
      if (input.contact.assignedTo !== null)
        fail("Integration contacts cannot assign staff");
      const payloadHash = digest(JSON.stringify(input.contact));
      const result = await transaction(async (c) => {
        await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          key.id + ":" + input.eventId,
        ]);
        if (
          !(
            await c.query(
              "SELECT id FROM reign_crm_keys WHERE id=$1 AND revoked_at IS NULL AND expires_at>now() FOR SHARE",
              [key.id],
            )
          ).rowCount
        )
          fail("Integration credential revoked", 401);
        const prior = (
          await c.query(
            "SELECT * FROM reign_crm_ingestion WHERE key_id=$1 AND event_id=$2",
            [key.id, input.eventId],
          )
        ).rows[0];
        if (prior) {
          if (prior.payload_hash !== payloadHash)
            fail("Event ID already contains different contact data", 409);
          return { leadId: prior.lead_id, replayed: true };
        }
        const lead = await createContact(
          c,
          input.contact,
          "Integration: " + key.name,
        );
        await c.query(
          "INSERT INTO reign_crm_ingestion(key_id,event_id,payload_hash,lead_id) VALUES($1,$2,$3,$4)",
          [key.id, input.eventId, payloadHash, lead.id],
        );
        return { leadId: lead.id, replayed: false };
      });
      res.status(result.replayed ? 200 : 201).json(result);
      if (!result.replayed)
        void onLeadCreated("lead.created", {
          id: result.leadId,
          source: "Integration: " + key.name,
        });
    }),
  );
}
