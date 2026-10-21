import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertLeadSchema, insertWebhookSchema, leadStatuses, webhookEvents } from "@shared/schema";
import { z } from "zod";
import { authMiddleware, requireRole, hashPassword, verifyPassword, createSession, destroySession } from "./auth";
import crypto from "crypto";
import { getInference as getOpenAI, freeModel, publicBaseUrl } from "./inference";
import {registerSitePlans} from "./site-plans";
import { registerOperations } from "./reign-operations";
import { registerAgents, limiter } from "./reign-agents";
import { contextGraph } from "./reign-context";
import { publishPost } from "./blog-publisher";
import { pool } from "./db";
import { parseModelJson,parseResearch } from "./model-json";
import { requireEmailAccepted } from "./mail-result";
import { getResendClient } from "./resend";

async function fireWebhooks(event: string, payload: Record<string, any>) {
  try {
    const hooks = await storage.getActiveWebhooksForEvent(event);
    for (const hook of hooks) {
      const body = JSON.stringify({ event, data: payload, timestamp: new Date().toISOString() });
      const signature = crypto.createHmac("sha256", hook.secret).update(body).digest("hex");
      const start = Date.now();
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const resp = await fetch(hook.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Webhook-Signature": signature,
            "X-Webhook-Event": event,
          },
          body,
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const duration = Date.now() - start;
        const respText = await resp.text().catch(() => "");
        await storage.createWebhookLog({
          webhookId: hook.id,
          event,
          payload: body,
          statusCode: resp.status,
          response: respText.substring(0, 2000),
          success: resp.ok,
          duration,
        });
      } catch (e: any) {
        const duration = Date.now() - start;
        await storage.createWebhookLog({
          webhookId: hook.id,
          event,
          payload: body,
          statusCode: 0,
          response: e?.message || "Connection failed",
          success: false,
          duration,
        });
      }
    }
  } catch (e: any) {
    console.error("Webhook dispatch error:", e?.message);
  }
}


async function sendSentimentSurvey(lead: { id: number; name: string; email: string }) {
  try {
    const enabled = await storage.getSetting("sentiment_auto_survey");
    if (enabled === "false") return;

    const alreadySent = await storage.getLeadSentimentSent(lead.id);
    if (alreadySent) return;

    const token = crypto.randomUUID();
    const baseUrl = publicBaseUrl();
    const rateUrl = `${baseUrl}/rate/${token}?leadId=${lead.id}`;

    const { client, fromEmail } = await getResendClient();
    const result = await client.emails.send({
      from: fromEmail,
      to: lead.email,
      subject: "How was your experience with Reign Services?",
      html: `
        <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #0B0B0D; color: #F5F5F7; padding: 40px 24px; border-radius: 8px;">
          <p style="color: #B3B3B8; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 16px;">Reign Services</p>
          <h2 style="font-size: 22px; font-weight: 700; margin: 0 0 16px 0;">How did we do, ${lead.name.split(" ")[0]}?</h2>
          <p style="color: #B3B3B8; font-size: 14px; line-height: 1.6; margin-bottom: 32px;">Your project has been completed. We'd appreciate a quick rating of your experience.</p>
          <div style="text-align: center; margin-bottom: 32px;">
            <a href="${rateUrl}&score=5" style="text-decoration: none; font-size: 32px; margin: 0 8px;">&#128515;</a>
            <a href="${rateUrl}&score=4" style="text-decoration: none; font-size: 32px; margin: 0 8px;">&#128578;</a>
            <a href="${rateUrl}&score=3" style="text-decoration: none; font-size: 32px; margin: 0 8px;">&#128528;</a>
            <a href="${rateUrl}&score=2" style="text-decoration: none; font-size: 32px; margin: 0 8px;">&#128533;</a>
            <a href="${rateUrl}&score=1" style="text-decoration: none; font-size: 32px; margin: 0 8px;">&#128542;</a>
          </div>
          <p style="color: #B3B3B8; font-size: 12px; text-align: center;">Click a face to rate. Takes 2 seconds.</p>
        </div>
      `,
    });

    requireEmailAccepted(result);
    await storage.markLeadSentimentSent(lead.id);
  } catch (e: any) {
    console.error("Sentiment survey email error:", e?.message);
  }
}

const generatedArticle = z.object({
  title:z.string().trim().min(1).max(200),content:z.string().trim().min(100).max(100000),
  excerpt:z.string().max(2000).optional(),tags:z.array(z.string().max(100)).max(20).optional(),
  seoTitle:z.string().max(200).optional(),seoDescription:z.string().max(500).optional(),
  seoKeywords:z.array(z.string().max(100)).max(30).optional(),
});

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 100);
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.use("/api/ai", (req, res, next) => {
    if (req.method === "POST" && !process.env.OPENROUTER_API_KEY) {
      return res.status(503).json({ message: "AI features are awaiting provider configuration" });
    }
    next();
  });

  registerOperations(app);
  registerSitePlans(app);
  registerAgents(app);

  // ─── Auth Routes ───────────────────────────────────────────────

  app.post("/api/auth/login", limiter(10, 15 * 60000), async (req, res) => {
    try {
      const { password } = req.body;
      const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
      if (!email || typeof password !== "string" || password.length > 256) {
        return res.status(400).json({ message: "Email and password required" });
      }
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      await createSession(res, user.id);
      res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
    } catch {
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    await destroySession(req, res);
    res.json({ message: "Logged out" });
  });

  app.get("/api/auth/me", authMiddleware, (req, res) => {
    const u = req.user!;
    res.json({ id: u.id, name: u.name, email: u.email, role: u.role });
  });

  // ─── User Management (root + admin, with root protection) ───

  app.get("/api/users", authMiddleware, requireRole("root", "admin"), async (_req, res) => {
    try {
      const users = await storage.getUsers();
      res.json(users.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role, createdAt: u.createdAt })));
    } catch {
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.post("/api/users", authMiddleware, requireRole("root", "admin"), async (req, res) => {
    try {
      const { name, password, role } = req.body;
      const email = z.string().email().max(254).parse(req.body.email).trim().toLowerCase();
      if (role && !["root","admin","editor"].includes(role)) return res.status(400).json({message:"Invalid role"});
      if (typeof password !== "string" || password.length < 8 || password.length > 256) return res.status(400).json({message:"Password must be 8–256 characters"});
      if (!name || !email || !password) {
        return res.status(400).json({ message: "Name, email, and password required" });
      }
      if (role === "root" && req.user!.role !== "root") {
        return res.status(403).json({ message: "Only the webmaster can create root users" });
      }
      const existing = await storage.getUserByEmail(email);
      if (existing) {
        return res.status(409).json({ message: "Email already in use" });
      }
      const passwordHash = await hashPassword(password);
      const user = await storage.createUser({ name, email, role: role || "editor", passwordHash });
      res.status(201).json({ id: user.id, name: user.name, email: user.email, role: user.role });
    } catch {
      res.status(500).json({ message: "Failed to create user" });
    }
  });

  app.patch("/api/users/:id", authMiddleware, requireRole("root", "admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      const target = await storage.getUserById(id);
      if (!target) {
        return res.status(404).json({ message: "User not found" });
      }
      if (target.role === "root" && req.user!.role !== "root") {
        return res.status(403).json({ message: "Cannot modify webmaster account" });
      }
      if (req.body.role === "root" && req.user!.role !== "root") {
        return res.status(403).json({ message: "Only the webmaster can assign root role" });
      }
      const updates: Record<string, any> = {};
      if (req.body.role && !["root","admin","editor"].includes(req.body.role)) return res.status(400).json({message:"Invalid role"});
      if (req.body.role) updates.role = req.body.role;
      if (req.body.name) updates.name = req.body.name;

      const user = await storage.updateUser(id, updates);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
    } catch {
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  app.delete("/api/users/:id", authMiddleware, requireRole("root", "admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      if (req.user!.id === id) {
        return res.status(400).json({ message: "Cannot delete yourself" });
      }
      const target = await storage.getUserById(id);
      if (!target) {
        return res.status(404).json({ message: "User not found" });
      }
      if (target.role === "root" && req.user!.role !== "root") {
        return res.status(403).json({ message: "Cannot delete webmaster account" });
      }
      await storage.deleteUser(id);
      res.json({ message: "User deleted" });
    } catch {
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  // ─── Lead Routes ───────────────────────────────────────────────

  app.post("/api/leads", async (req, res) => {
    try {
      const data = insertLeadSchema.parse(req.body);
      const lead = await storage.createLead(data);
      res.status(201).json(lead);
      fireWebhooks("lead.created", { id: lead.id, name: lead.name, email: lead.email, phone: lead.phone, vehicle: lead.vehicle, insurance: lead.insurance, message: lead.message, status: lead.status, createdAt: lead.createdAt });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to create lead" });
      }
    }
  });

  app.get("/api/leads", authMiddleware, requireRole("root", "admin"), async (_req, res) => {
    try {
      const allLeads = await storage.getLeads();
      res.json(allLeads);
    } catch {
      res.status(500).json({ message: "Failed to fetch leads" });
    }
  });

  app.get("/api/leads/:id", authMiddleware, requireRole("root", "admin"), async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      const lead = await storage.getLead(id);
      if (!lead) {
        return res.status(404).json({ message: "Lead not found" });
      }
      res.json(lead);
    } catch {
      res.status(500).json({ message: "Failed to fetch lead" });
    }
  });

  app.patch("/api/leads/:id", authMiddleware, requireRole("root", "admin"), async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      const updates: Record<string, any> = {};

      if (req.body.status) {
        if (!leadStatuses.includes(req.body.status)) {
          return res.status(400).json({ message: "Invalid status" });
        }
        updates.status = req.body.status;
      }

      if (typeof req.body.loanerRequested === "boolean") {
        updates.loanerRequested = req.body.loanerRequested;
      }
      if (typeof req.body.pickupRequested === "boolean") {
        updates.pickupRequested = req.body.pickupRequested;
      }
      if (typeof req.body.insuranceApproved === "boolean") {
        updates.insuranceApproved = req.body.insuranceApproved;
        if (req.body.insuranceApproved) {
          updates.insuranceApprovalTimestamp = new Date();
        }
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }

      const lead = await storage.updateLead(id, updates);
      if (!lead) {
        return res.status(404).json({ message: "Lead not found" });
      }
      res.json(lead);
      fireWebhooks("lead.updated", { id: lead.id, name: lead.name, email: lead.email, phone: lead.phone, vehicle: lead.vehicle, status: lead.status, changes: Object.keys(updates) });
      if (updates.status === "Delivered") {
        sendSentimentSurvey({ id: lead.id, name: lead.name, email: lead.email });
      }
    } catch {
      res.status(500).json({ message: "Failed to update lead" });
    }
  });

  // ─── Blog Post Routes ─────────────────────────────────────────

  app.get("/api/posts/queue", authMiddleware, requireRole("root", "admin", "editor"), async (_req, res) => {
    try {
      const queued = await storage.getPosts("queued");
      res.json(queued);
    } catch {
      res.status(500).json({ message: "Failed to fetch queue" });
    }
  });

  app.get("/api/posts", async (req, res) => {
    try {
      let canPreview = false;
      const token=req.cookies?.ds_session;
      const session=token ? await storage.getSessionByToken(token) : undefined;
      if(session && session.expiresAt>new Date()) {
        const user=await storage.getUserById(session.userId);
        canPreview=!!user && ["root","admin","editor"].includes(user.role);
      }
      const status = canPreview ? req.query.status as string | undefined : "published";
      const allPosts = await storage.getPosts(status);
      res.json(allPosts);
    } catch {
      res.status(500).json({ message: "Failed to fetch posts" });
    }
  });

  app.get("/api/posts/:idOrSlug", async (req, res) => {
    try {
      const param = req.params.idOrSlug;
      const id = /^\d+$/.test(param) ? Number(param) : NaN;
      const post = isNaN(id) ? await storage.getPostBySlug(param) : await storage.getPostById(id);
      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }
      if(post.status!=="published") {
        const session=req.cookies?.ds_session ? await storage.getSessionByToken(req.cookies.ds_session) : undefined;
        const user=session && session.expiresAt>new Date() ? await storage.getUserById(session.userId) : undefined;
        if(!user || !["root","admin","editor"].includes(user.role)) return res.status(404).json({message:"Post not found"});
        res.set("Cache-Control","no-store");
      }
      res.json(post);
    } catch {
      res.status(500).json({ message: "Failed to fetch post" });
    }
  });

  app.post("/api/posts", authMiddleware, requireRole("root", "admin", "editor"), async (req, res) => {
    try {
      const { title, content, excerpt, tags, seoTitle, seoDescription, status, featuredImage } = req.body;
      if (status && !["draft","queued","published"].includes(status)) return res.status(400).json({message:"Invalid post status"});
      if (!title) {
        return res.status(400).json({ message: "Title is required" });
      }
      let slug = slugify(title);
      const existing = await storage.getPostBySlug(slug);
      if (existing) {
        slug = slug + "-" + Date.now().toString(36);
      }
      const post = await storage.createPost({
        title,
        slug,
        content: content || "",
        excerpt: excerpt || null,
        tags: tags || [],
        seoTitle: seoTitle || null,
        seoDescription: seoDescription || null,
        status: status === "published" ? "draft" : status || "draft",
        featuredImage: featuredImage || null,
        publishedAt: status === "published" ? new Date() : null,
        authorId: req.user!.id,
      });
      const result = status === "published" ? await publishPost(post.id,p=>fireWebhooks("post.published",{id:p.id,title:p.title,slug:p.slug,publishedAt:p.publishedAt})) : post;
      res.status(201).json(result);
    } catch {
      res.status(500).json({ message: "Failed to create post" });
    }
  });

  app.patch("/api/posts/:id", authMiddleware, requireRole("root", "admin", "editor"), async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      const updates: Record<string, any> = {};
      if(req.body.status && !["draft","queued","published"].includes(req.body.status)) return res.status(400).json({message:"Invalid post status"});
      const fields = ["title", "content", "excerpt", "tags", "seoTitle", "seoDescription", "seoKeywords", "status", "featuredImage"];
      for (const f of fields) {
        if (req.body[f] !== undefined) updates[f] = req.body[f];
      }
      if (updates.status === "published") {
        const existing = await storage.getPostById(id);
        if (existing && !existing.publishedAt) {
          updates.publishedAt = new Date();
        }
      }
      if (updates.title) {
        updates.slug = slugify(updates.title);
        const existing = await storage.getPostBySlug(updates.slug);
        if (existing && existing.id !== id) {
          updates.slug = updates.slug + "-" + Date.now().toString(36);
        }
      }
      const publishing=updates.status==="published";
      if(publishing) delete updates.status;
      const post = await storage.updatePost(id, updates);
      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }
      res.json(publishing ? await publishPost(id,p=>fireWebhooks("post.published",{id:p.id,title:p.title,slug:p.slug,publishedAt:p.publishedAt})) : post);
    } catch {
      res.status(500).json({ message: "Failed to update post" });
    }
  });

  app.delete("/api/posts/purge-all", authMiddleware, requireRole("root"), async (_req, res) => {
    try {
      const allPosts = await storage.getPosts();
      for (const post of allPosts) {
        await storage.deletePost(post.id);
      }
      const allTopics = await storage.getTopics();
      for (const topic of allTopics) {
        await storage.deleteTopic(topic.id);
      }
      res.json({ message: `Deleted ${allPosts.length} posts and ${allTopics.length} associated topics` });
    } catch {
      res.status(500).json({ message: "Failed to purge posts" });
    }
  });

  app.delete("/api/posts/:id", authMiddleware, requireRole("root", "admin"), async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      await storage.deletePost(id);
      res.json({ message: "Post deleted" });
    } catch {
      res.status(500).json({ message: "Failed to delete post" });
    }
  });

  // ─── AI Article Generation (single topic) ──────────────────────

  async function handleWriteArticle(req: Request, res: Response): Promise<void> {
    let jobId: number | undefined;
    try {
      const { topic, keywords, tone } = req.body;
      if (!topic) {
        res.status(400).json({ message: "Topic is required" });
        return;
      }

      const servicesContext = JSON.stringify((await contextGraph()).services);

      const job = await storage.createAiJob({ type: "article", input: JSON.stringify({ topic, keywords, tone }) });
      jobId=job.id;

      const systemPrompt = `You are an expert renovation content writer for Reign Services, DFW's premier interior and exterior renovation contractor. Write authoritative, professional blog articles about the following active services: ${servicesContext}.

Rules:
- Write in a controlled, confident tone. No exclamation points. No sales hype.
- Use substantive, factual content. Include specific details about renovation techniques, material selection, and project execution.
- Target Dallas-Fort Worth market when relevant.
- Structure with H2 and H3 headings using markdown.
- Only reference services from the active services list above when making internal links
- Include internal links using proper markdown link syntax: [link text](/path). For example: [our services](/services), [contact us](/contact). Do NOT output raw URLs or bare paths.
- Include a compelling excerpt (2 sentences max).
- Suggest 3-5 relevant tags.
- Suggest an SEO title (60 chars max) and meta description (155 chars max).
- Minimum 800 words of article content.`;

      const userPrompt = `Write a blog article about: ${topic}${keywords ? `\nTarget keywords: ${keywords}` : ""}${tone ? `\nTone: ${tone}` : ""}

Respond in this exact JSON format:
{
  "title": "Article Title",
  "excerpt": "Brief 1-2 sentence excerpt",
  "content": "Full article content in markdown",
  "tags": ["tag1", "tag2"],
  "seoTitle": "SEO Title",
  "seoDescription": "Meta description"
}`;

      const response = await getOpenAI().chat.completions.create({
        model: freeModel(),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 8192,
      }, { timeout: 180000 });

      const raw = response.choices[0]?.message?.content || "{}";
      const article = generatedArticle.parse(parseModelJson(raw));


      const slug = slugify(article.title || topic);
      const existingSlug = await storage.getPostBySlug(slug);
      const finalSlug = existingSlug ? slug + "-" + Date.now().toString(36) : slug;

      const post = await storage.createPost({
        title: article.title || topic,
        slug: finalSlug,
        content: article.content || "",
        excerpt: article.excerpt || null,
        tags: article.tags || [],
        seoTitle: article.seoTitle || null,
        seoDescription: article.seoDescription || null,
        seoKeywords: article.seoKeywords || [],
        status: "draft",
        featuredImage: null,
        publishedAt: null,
        authorId: req.user!.id,
      });

      await storage.updateAiJob(job.id, { output: raw, status: "completed" });
      res.json({ post, job: {...job,status:"completed",output:raw} });
    } catch (error: unknown) {
      const kind = error instanceof z.ZodError ? "invalid_article" : error instanceof SyntaxError ? "invalid_json" : error instanceof Error ? error.name : "inference_error";
      if(jobId) await storage.updateAiJob(jobId,{status:"failed",output:JSON.stringify({error:"Inference failed or returned invalid article",kind})});
      console.error("AI write failed", {kind});
      res.status(503).json({ message: "Article inference is unavailable or returned an invalid article. Try again later." });
    }
  }

  // Both endpoints share the same handler — /api/ai/write is the canonical name
  app.post("/api/ai/generate-article", authMiddleware, requireRole("root", "admin", "editor"), handleWriteArticle);
  app.post("/api/ai/write", authMiddleware, requireRole("root", "admin", "editor"), handleWriteArticle);

  app.get("/api/ai/jobs", authMiddleware, requireRole("root", "admin"), async (_req, res) => {
    try {
      const jobs = await storage.getAiJobs();
      res.json(jobs);
    } catch {
      res.status(500).json({ message: "Failed to fetch AI jobs" });
    }
  });

  // ─── Research Agent: 5 Topic Suggestions Only ──────────────────

  app.get("/api/topics", authMiddleware, requireRole("root", "admin", "editor"), async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const allTopics = await storage.getTopics(status);
      res.json(allTopics);
    } catch {
      res.status(500).json({ message: "Failed to fetch topics" });
    }
  });

  app.get("/api/topics/:id", authMiddleware, requireRole("root", "admin", "editor"), async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      const topic = await storage.getTopicById(id);
      if (!topic) return res.status(404).json({ message: "Topic not found" });
      res.json(topic);
    } catch {
      res.status(500).json({ message: "Failed to fetch topic" });
    }
  });

  app.post("/api/ai/research", authMiddleware, requireRole("root", "admin", "editor"), async (req, res) => {
    try {
      const job = await storage.createAiJob({
        type: "research",
        input: JSON.stringify({ triggeredBy: req.user!.email }),
      });

      res.json({ jobId: job.id, status: "processing" });

      (async () => {
        try {
          const activeServices = JSON.stringify((await contextGraph()).services);

          const researchPrompt = `You are an expert SEO strategist and content marketing researcher for Reign Services, DFW's premier interior and exterior renovation contractor in Dallas-Fort Worth, Texas.

Active services offered by Reign Services:
${activeServices}

First, review these active services thoroughly. Your research and topic suggestions must be directly relevant to these services only.

Suggest editorial hypotheses for the home renovation and outdoor living industry in DFW. You do not have live search data. Do not claim observed rankings, verified search volumes, or sources you did not retrieve. Label all volume/competition estimates as unverified. Consider:
1. What topics competitors are ranking for across these specific services
2. High-volume, low-competition keywords tied to these services in the DFW market
3. Seasonal search trends relevant to these services (outdoor projects, interior renovations)
4. Customer pain points and frequently asked questions about these specific services
5. Local SEO opportunities in Dallas-Fort Worth for these renovation services

Then identify 5 highly effective article topics that will:
- Drive organic search traffic specifically for these active services
- Convert readers into free assessment requests
- Target different services from the active list above
- Include location-specific DFW angles where relevant
- Cover informational, commercial, and transactional intent

For each topic provide:
- title: compelling headline
- overview: 1-paragraph overview of the article concept (what it covers, angle, unique value)
- targetKeywords: array of 5-8 target keywords/phrases
- searchIntent: "informational" | "commercial" | "transactional"
- estimatedSearchVolume: "high" | "medium" | "low"
- competitionLevel: "high" | "medium" | "low"
- leadPotential: brief explanation of how this drives leads
- reasoning: why this topic was chosen; explain that live search validation is still needed

Respond in JSON format:
{
  "marketInsights": "Brief summary of competitive landscape and opportunities",
  "topics": [
    {
      "title": "...",
      "overview": "...",
      "targetKeywords": ["..."],
      "searchIntent": "...",
      "estimatedSearchVolume": "...",
      "competitionLevel": "...",
      "leadPotential": "...",
      "reasoning": "..."
    }
  ]
}`;

          const researchResponse = await getOpenAI().chat.completions.create({
            model: freeModel(),
            messages: [{ role: "user", content: researchPrompt }],
            response_format: { type: "json_object" },
            max_completion_tokens: 4096,
          }, { timeout: 180000 });

          const researchRaw = researchResponse.choices[0]?.message?.content || "{}";
          const research = parseResearch(researchRaw);
          const topicsData = research.topics;
          for (const t of topicsData.slice(0, 5)) {
            await storage.createTopic({
              title: t.title,
              overview: t.overview || "",
              targetKeywords: t.targetKeywords || [],
              searchIntent: t.searchIntent || null,
              estimatedSearchVolume: t.estimatedSearchVolume,
              competitionLevel: t.competitionLevel,
              leadPotential: t.leadPotential,
              reasoning: t.reasoning,
              aiJobId: job.id,
            });
          }

          await storage.updateAiJob(job.id, {
            output: JSON.stringify({ research, topicCount: topicsData.length }),
            status: "completed",
          });
        } catch (e: any) {
          console.error("Research agent error:", e?.message);
          await storage.updateAiJob(job.id, { output: JSON.stringify({ error: e?.message }), status: "failed" });
        }
      })();
    } catch (error: any) {
      console.error("Research agent error:", error);
      res.status(500).json({ message: "Failed to start research agent", error: error?.message });
    }
  });

  // ─── Writer Agent: Generate Article from Topic ──────────────────

  app.post("/api/topics/:id/generate", authMiddleware, requireRole("root", "admin", "editor"), async (req, res) => {
    try {
      const topicId = parseInt(String(req.params.id), 10);
      const topic = await storage.getTopicById(topicId);
      if (!topic) return res.status(404).json({ message: "Topic not found" });
      if (topic.status === "generated" || topic.status === "generating") {
        return res.status(400).json({ message: "Article already generated or in progress for this topic" });
      }

      await storage.updateTopic(topicId, { status: "generating" });
      res.json({ status: "generating", topicId });

      (async () => {
        try {
          const activeServices = JSON.stringify((await contextGraph()).services);

          const articlePrompt = `You are an expert renovation content writer for Reign Services, DFW's premier interior and exterior renovation contractor in Dallas, TX.

Active services offered by Reign Services: ${activeServices}

Write a comprehensive, SEO-optimized blog article based on this research:
Topic: ${topic.title}
Overview: ${topic.overview}
Target Keywords: ${(topic.targetKeywords || []).join(", ")}
Search Intent: ${topic.searchIntent || "informational"}

Rules:
- Write in a controlled, confident tone. No exclamation points. No sales hype.
- Naturally incorporate target keywords throughout the content
- Use substantive, factual content with specific details about renovation techniques, material selection, and project execution
- Target Dallas-Fort Worth market when relevant
- Structure with H2 and H3 headings using markdown
- Minimum 1000 words
- Only reference services from the active services list above when making internal links
- Include internal links using proper markdown link syntax: [link text](/path). For example: [our services](/services), [contact us](/contact). Do NOT output raw URLs or bare paths.
- End with a subtle call-to-action that encourages booking a free assessment with Reign Services

Respond in JSON format:
{
  "title": "Article Title",
  "excerpt": "2 sentence excerpt for search results",
  "content": "Full markdown article content",
  "tags": ["tag1", "tag2", "tag3"],
  "seoTitle": "SEO page title (60 chars max)",
  "seoDescription": "Meta description (155 chars max)",
  "seoKeywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"]
}`;

          const articleResponse = await getOpenAI().chat.completions.create({
            model: freeModel(),
            messages: [{ role: "user", content: articlePrompt }],
            response_format: { type: "json_object" },
            max_completion_tokens: 8192,
          }, { timeout: 180000 });

          const articleRaw = articleResponse.choices[0]?.message?.content || "{}";
          const article = generatedArticle.parse(parseModelJson(articleRaw));

          let slug = slugify(article.title || topic.title);
          const existingSlug = await storage.getPostBySlug(slug);
          if (existingSlug) slug = slug + "-" + Date.now().toString(36);

          const post = await storage.createPost({
            title: article.title || topic.title,
            slug,
            content: article.content || "",
            excerpt: article.excerpt || null,
            tags: article.tags || [],
            seoTitle: article.seoTitle || null,
            seoDescription: article.seoDescription || null,
            seoKeywords: article.seoKeywords || [],
            status: "queued",
            featuredImage: null,
            publishedAt: null,
            topicId,
            authorId: req.user!.id,
          });

          await storage.updateTopic(topicId, { status: "generated", postId: post.id });
        } catch (e: any) {
          console.error("Writer agent error:", e?.message);
          await storage.updateTopic(topicId, { status: "suggested" });
        }
      })();
    } catch (error: any) {
      console.error("Writer agent error:", error);
      res.status(500).json({ message: "Failed to generate article from topic" });
    }
  });

  // ─── Archive Topic ──────────────────────────────────────────────

  app.patch("/api/topics/:id/archive", authMiddleware, requireRole("root", "admin", "editor"), async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      const topic = await storage.updateTopic(id, { status: "archived" });
      if (!topic) return res.status(404).json({ message: "Topic not found" });
      res.json(topic);
    } catch {
      res.status(500).json({ message: "Failed to archive topic" });
    }
  });

  app.get("/api/ai/research-jobs", authMiddleware, requireRole("root", "admin", "editor"), async (_req, res) => {
    try {
      const jobs = await storage.getAiJobsByType("research");
      res.json(jobs);
    } catch {
      res.status(500).json({ message: "Failed to fetch research jobs" });
    }
  });

  // ─── Publisher Agent: Publish + SEO + Backlinks + Auto-Newsletter ──

  app.post("/api/posts/:id/publish", authMiddleware, requireRole("root", "admin", "editor"), async (req, res) => {
    try {
      const id=z.coerce.number().int().positive().parse(req.params.id);
      const post=await publishPost(id,p=>fireWebhooks("post.published",{id:p.id,title:p.title,slug:p.slug,publishedAt:p.publishedAt}));
      if(!post) return res.status(404).json({message:"Post not found"});
      res.json(post);
    } catch {
      res.status(500).json({message:"Publishing failed; no partial distribution was committed"});
    }
  });

  // ─── Read/Share Count Tracking ──────────────────────────────────

  app.post("/api/posts/:id/read", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      await storage.incrementPostReadCount(id);
      res.json({ success: true });
    } catch {
      res.status(500).json({ message: "Failed to track read" });
    }
  });

  app.post("/api/posts/:id/share", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      await storage.incrementPostShareCount(id);
      res.json({ success: true });
    } catch {
      res.status(500).json({ message: "Failed to track share" });
    }
  });

  // ─── Backlink Agent ─────────────────────────────────────────────

  app.post("/api/ai/backlink-research", authMiddleware, requireRole("root", "admin"), async (req, res) => {
    try {
      const { postId } = req.body;
      if (!postId) return res.status(400).json({ message: "Post ID required" });

      const post = await storage.getPostById(postId);
      if (!post) return res.status(404).json({ message: "Post not found" });

      const prompt = `You are an expert SEO link building strategist. Analyze this blog article and recommend the 8 most effective platforms/websites to distribute it for maximum backlink value and organic traffic.

Article Title: ${post.title}
Article Topic: ${post.excerpt || post.title}
Tags: ${(post.tags || []).join(", ")}

For each platform, provide:
- platform: name of the platform/website
- type: "social" | "forum" | "directory" | "guest-post" | "aggregator" | "community"
- authority: "high" | "medium" | "low" (domain authority estimate)
- relevance: brief explanation of why this platform is effective for this content
- suggestedAction: what specifically to do on this platform (e.g., "Submit to relevant subreddit", "Share with industry hashtags")

Respond in JSON format:
{
  "platforms": [
    {
      "platform": "...",
      "type": "...",
      "authority": "...",
      "relevance": "...",
      "suggestedAction": "..."
    }
  ]
}`;

      const response = await getOpenAI().chat.completions.create({
        model: freeModel(),
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_completion_tokens: 2048,
      }, { timeout: 180000 });

      const raw = response.choices[0]?.message?.content || "{}";
      let result;
      try {
        result = parseModelJson(raw);
      } catch {
        result = { platforms: [] };
      }

      res.json(result);
    } catch (error: any) {
      console.error("Backlink research error:", error);
      res.status(500).json({ message: "Failed to research backlink platforms" });
    }
  });

  app.post("/api/backlinks/generate", authMiddleware, requireRole("root", "admin"), async (req, res) => {
    try {
      const { postId, platform } = req.body;
      if (!postId || !platform) return res.status(400).json({ message: "Post ID and platform required" });

      const post = await storage.getPostById(postId);
      if (!post) return res.status(404).json({ message: "Post not found" });

      const shortCode = crypto.randomBytes(4).toString("hex");
      const utmSource = platform.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const utmCampaign = post.slug;

      const baseUrl = publicBaseUrl();

      const articleUrl = `${baseUrl}/blog/${post.slug}?utm_source=${utmSource}&utm_medium=referral&utm_campaign=${utmCampaign}`;

      const backlink = await storage.createBacklink({
        postId,
        platform,
        url: articleUrl,
        utmSource,
        utmMedium: "referral",
        utmCampaign,
        shortCode,
      });

      const trackingUrl = `${baseUrl}/r/${shortCode}`;

      res.json({ backlink, trackingUrl, articleUrl });
    } catch (error: any) {
      console.error("Backlink generation error:", error);
      res.status(500).json({ message: "Failed to generate backlink" });
    }
  });

  app.get("/api/backlinks", authMiddleware, requireRole("root", "admin"), async (req, res) => {
    try {
      const postId = req.query.postId ? parseInt(req.query.postId as string) : undefined;
      const links = postId ? await storage.getBacklinksByPostId(postId) : await storage.getAllBacklinks();
      res.json(links);
    } catch {
      res.status(500).json({ message: "Failed to fetch backlinks" });
    }
  });

  app.get("/api/backlinks/analytics", authMiddleware, requireRole("root", "admin"), async (_req, res) => {
    try {
      const analytics = await storage.getBacklinkAnalytics();
      res.json(analytics);
    } catch {
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  // ─── Backlink Click Tracking Redirect ───────────────────────────

  app.get("/r/:shortCode", async (req, res) => {
    try {
      const backlink = await storage.getBacklinkByShortCode(req.params.shortCode);
      if (!backlink) return res.status(404).send("Not found");

      await storage.incrementBacklinkClicks(backlink.id);
      await storage.createBacklinkClick({
        backlinkId: backlink.id,
        referrer: req.headers.referer || null,
        userAgent: req.headers["user-agent"] || null,
      });

      res.redirect(301, backlink.url);
    } catch {
      res.status(500).send("Error");
    }
  });

  // ─── Newsletter Subscriber Routes ─────────────────────────────

  app.post("/api/subscribers", async (req, res) => {
    try {
      const { name, email } = req.body;
      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }
      const existing = await storage.getSubscriberByEmail(email);
      if (existing) {
        if (existing.status === "unsubscribed") {
          await storage.updateSubscriber(existing.id, { status: "active" });
          return res.json({ message: "Re-subscribed" });
        }
        return res.json({ message: "Already subscribed" });
      }
      const unsubscribeToken = crypto.randomBytes(32).toString("hex");
      const sub = await storage.createSubscriber({ name: name || null, email, unsubscribeToken });
      res.status(201).json({ message: "Subscribed" });
      fireWebhooks("subscriber.created", { id: sub.id, email: sub.email, name: sub.name, createdAt: sub.createdAt });
    } catch {
      res.status(500).json({ message: "Failed to subscribe" });
    }
  });

  app.get("/api/subscribers", authMiddleware, requireRole("root", "admin"), async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const subs = await storage.getSubscribers(status);
      res.json(subs);
    } catch {
      res.status(500).json({ message: "Failed to fetch subscribers" });
    }
  });

  app.delete("/api/subscribers/:id", authMiddleware, requireRole("root", "admin"), async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      await storage.deleteSubscriber(id);
      res.json({ message: "Subscriber deleted" });
    } catch {
      res.status(500).json({ message: "Failed to delete subscriber" });
    }
  });

  app.get("/api/unsubscribe/:token", async (req, res) => {
    try {
      const sub = await storage.getSubscriberByToken(req.params.token);
      if (!sub) {
        return res.status(404).json({ message: "Subscriber not found" });
      }
      await storage.updateSubscriber(sub.id, { status: "unsubscribed" });
      res.json({ message: "Unsubscribed successfully" });
    } catch {
      res.status(500).json({ message: "Failed to unsubscribe" });
    }
  });

  // ─── Newsletter Routes ────────────────────────────────────────

  app.get("/api/newsletters", authMiddleware, requireRole("root", "admin"), async (_req, res) => {
    try {
      const newsletters = await storage.getNewsletters();
      res.json(newsletters);
    } catch {
      res.status(500).json({ message: "Failed to fetch newsletters" });
    }
  });

  app.post("/api/newsletters", authMiddleware, requireRole("root", "admin"), async (req, res) => {
    try {
      const { subject, htmlContent } = req.body;
      if (!subject || !htmlContent) {
        return res.status(400).json({ message: "Subject and content required" });
      }
      const newsletter = await storage.createNewsletter({ subject, htmlContent });
      res.status(201).json(newsletter);
    } catch {
      res.status(500).json({ message: "Failed to create newsletter" });
    }
  });

  app.post("/api/newsletters/:id/send", authMiddleware, requireRole("root", "admin"), async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      const newsletter = await storage.getNewsletterById(id);
      if (!newsletter) {
        return res.status(404).json({ message: "Newsletter not found" });
      }
      if (newsletter.status !== "draft") return res.status(409).json({message:"This newsletter was already attempted. Review provider delivery logs before creating another send."});
      const activeSubscribers=await storage.getSubscribers("active");
      if(!activeSubscribers.length) return res.status(400).json({message:"No active subscribers"});
      let mail;
      try {mail=await getResendClient();}catch{return res.status(503).json({message:"Email service is awaiting configuration"});}
      const claimed=await pool.query("UPDATE newsletters SET status='sending' WHERE id=$1 AND status='draft' RETURNING id",[id]);
      if(!claimed.rowCount) return res.status(409).json({message:"This newsletter is already being sent or requires review"});
      let sent=0;
      for(const sub of activeSubscribers) {
        try {
          const result=await mail.client.emails.send({
            from:mail.fromEmail,to:sub.email,subject:newsletter.subject,
            html:newsletter.htmlContent+
              `<p><a href="${publicBaseUrl()}/api/unsubscribe/${encodeURIComponent(sub.unsubscribeToken)}">Unsubscribe</a></p>`,
          });
          requireEmailAccepted(result);sent++;
          await storage.updateNewsletter(id,{recipientCount:sent});
        } catch {console.error("Newsletter provider acceptance failed");}
      }
      const complete=sent===activeSubscribers.length;
      await storage.updateNewsletter(id,{status:complete?"sent":"review_required",sentAt:complete?new Date():null,recipientCount:sent});
      res.status(complete?200:503).json({
        message:complete?`Newsletter accepted for ${sent} subscribers`:`Only ${sent} of ${activeSubscribers.length} messages were accepted. Review provider logs before retrying.`,
        sent,status:complete?"sent":"review_required",
      });
    } catch {
      res.status(500).json({ message: "Failed to send newsletter" });
    }
  });

  // ─── Webhook Integration Routes ──────────────────────────────

  app.get("/api/webhooks", authMiddleware, requireRole("root", "admin"), async (_req, res) => {
    try {
      const hooks = await storage.getWebhooks();
      res.json(hooks);
    } catch {
      res.status(500).json({ message: "Failed to fetch webhooks" });
    }
  });

  app.post("/api/webhooks", authMiddleware, requireRole("root", "admin"), async (req, res) => {
    try {
      const data = insertWebhookSchema.parse({
        ...req.body,
        secret: req.body.secret || crypto.randomBytes(32).toString("hex"),
      });
      const hook = await storage.createWebhook(data);
      res.status(201).json(hook);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create webhook" });
    }
  });

  app.patch("/api/webhooks/:id", authMiddleware, requireRole("root", "admin"), async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      const updates: Record<string, any> = {};
      if (req.body.name !== undefined) updates.name = req.body.name;
      if (req.body.url !== undefined) updates.url = req.body.url;
      if (req.body.events !== undefined) updates.events = req.body.events;
      if (typeof req.body.active === "boolean") updates.active = req.body.active;
      if (req.body.secret !== undefined) updates.secret = req.body.secret;

      const hook = await storage.updateWebhook(id, updates);
      if (!hook) return res.status(404).json({ message: "Webhook not found" });
      res.json(hook);
    } catch {
      res.status(500).json({ message: "Failed to update webhook" });
    }
  });

  app.delete("/api/webhooks/:id", authMiddleware, requireRole("root", "admin"), async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      await storage.deleteWebhook(id);
      res.json({ message: "Webhook deleted" });
    } catch {
      res.status(500).json({ message: "Failed to delete webhook" });
    }
  });

  app.post("/api/webhooks/:id/test", authMiddleware, requireRole("root", "admin"), async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      const hook = await storage.getWebhookById(id);
      if (!hook) return res.status(404).json({ message: "Webhook not found" });

      const testPayload = {
        event: "webhook.test",
        data: { message: "This is a test webhook delivery from Reign Services CRM", timestamp: new Date().toISOString() },
        timestamp: new Date().toISOString(),
      };
      const body = JSON.stringify(testPayload);
      const signature = crypto.createHmac("sha256", hook.secret).update(body).digest("hex");
      const start = Date.now();
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const resp = await fetch(hook.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Webhook-Signature": signature, "X-Webhook-Event": "webhook.test" },
          body,
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const duration = Date.now() - start;
        const respText = await resp.text().catch(() => "");
        const log = await storage.createWebhookLog({
          webhookId: hook.id,
          event: "webhook.test",
          payload: body,
          statusCode: resp.status,
          response: respText.substring(0, 2000),
          success: resp.ok,
          duration,
        });
        res.json({ success: resp.ok, statusCode: resp.status, duration, log });
      } catch (e: any) {
        const duration = Date.now() - start;
        const log = await storage.createWebhookLog({
          webhookId: hook.id,
          event: "webhook.test",
          payload: body,
          statusCode: 0,
          response: e?.message || "Connection failed",
          success: false,
          duration,
        });
        res.json({ success: false, statusCode: 0, duration, error: e?.message, log });
      }
    } catch {
      res.status(500).json({ message: "Failed to test webhook" });
    }
  });

  app.get("/api/webhooks/logs", authMiddleware, requireRole("root", "admin"), async (req, res) => {
    try {
      const webhookId = req.query.webhookId ? parseInt(req.query.webhookId as string) : undefined;
      const logs = await storage.getWebhookLogs(webhookId);
      res.json(logs);
    } catch {
      res.status(500).json({ message: "Failed to fetch webhook logs" });
    }
  });

  app.get("/api/webhooks/events", authMiddleware, requireRole("root", "admin"), async (_req, res) => {
    res.json(webhookEvents);
  });

  // ─── Dashboard Stats ──────────────────────────────────────────

  app.get("/api/stats", authMiddleware, requireRole("root", "admin"), async (_req, res) => {
    try {
      const [allLeads, allPosts, allSubscribers, allNewsletters, allRatings, allBacklinks] = await Promise.all([
        storage.getLeads(),
        storage.getPosts(),
        storage.getSubscribers(),
        storage.getNewsletters(),
        storage.getAllRatings(),
        storage.getAllBacklinks(),
      ]);

      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const recentLeads = allLeads.filter(l => l.createdAt > thirtyDaysAgo);
      const delivered = allLeads.filter(l => l.status === "Delivered");
      const closed = allLeads.filter(l => l.status === "Closed" || l.status === "Delivered");
      const utmLeads = allLeads.filter(l => l.utmSource || l.utmCampaign);
      const pipelineStatuses = ["New Lead", "Sale Closed", "Claim Initiated", "RA Signed", "Loaner Assigned", "Vehicle In Shop", "Scoped", "Estimate Sent", "First Look", "Supplement Submitted", "Awaiting Approval", "Approved", "R&I", "PDR", "QC 1", "Reinstall", "QC 2", "Detail", "Ready for Delivery"];
      const pipelineLeads = allLeads.filter(l => pipelineStatuses.includes(l.status));
      const avgRating = allRatings.length > 0 ? allRatings.reduce((s, r) => s + r.score, 0) / allRatings.length : 0;
      const totalReads = allPosts.reduce((s, p) => s + (p.readCount || 0), 0);
      const totalShares = allPosts.reduce((s, p) => s + (p.shareCount || 0), 0);
      const totalClicks = allBacklinks.reduce((s, b) => s + (b.clicks || 0), 0);

      res.json({
        leads: {
          total: allLeads.length,
          new: allLeads.filter(l => l.status === "New Lead").length,
          recent: recentLeads.length,
          closed: closed.length,
        },
        posts: {
          total: allPosts.length,
          published: allPosts.filter(p => p.status === "published").length,
          drafts: allPosts.filter(p => p.status === "draft").length,
        },
        subscribers: {
          total: allSubscribers.length,
          active: allSubscribers.filter(s => s.status === "active").length,
        },
        newsletters: {
          total: allNewsletters.length,
          sent: allNewsletters.filter(n => n.status === "sent").length,
        },
        dyno: {
          rpm: recentLeads.length,
          rpmMax: Math.max(allLeads.length, 10),
          speed: allLeads.length > 0 ? Math.round((delivered.length / allLeads.length) * 100) : 0,
          temp: Math.round(avgRating * 20),
          tempRaw: Math.round(avgRating * 10) / 10,
          fuel: pipelineLeads.length,
          fuelMax: Math.max(allLeads.length, 10),
          boost: allLeads.length > 0 ? Math.round((utmLeads.length / allLeads.length) * 100) : 0,
          totalReads,
          totalShares,
          totalClicks,
          totalBacklinks: allBacklinks.length,
          publishedPosts: allPosts.filter(p => p.status === "published").length,
          activeSubscribers: allSubscribers.filter(s => s.status === "active").length,
          totalRatings: allRatings.length,
          deliveredCount: delivered.length,
        },
      });
    } catch {
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  // ─── Rating / Sentiment Routes ─────────────────────────────

  app.get("/api/rate/:token", async (req, res) => {
    try {
      const { token } = req.params;
      const score = parseInt(req.query.score as string);
      const leadId = req.query.leadId ? parseInt(req.query.leadId as string) : null;

      if (!score || score < 1 || score > 5) {
        return res.status(400).json({ message: "Invalid score" });
      }

      const existing = await storage.getRatingByToken(token);
      if (existing) {
        return res.redirect(`/rate/${token}?done=1`);
      }

      await storage.createRating({ leadId, score, token });
      res.redirect(`/rate/${token}?done=1&score=${score}`);
    } catch {
      res.status(500).json({ message: "Failed to submit rating" });
    }
  });

  app.get("/api/ratings", authMiddleware, requireRole("root", "admin"), async (_req, res) => {
    try {
      const allRatings = await storage.getAllRatings();
      res.json(allRatings);
    } catch {
      res.status(500).json({ message: "Failed to fetch ratings" });
    }
  });

  app.get("/api/ratings/summary", authMiddleware, requireRole("root", "admin"), async (_req, res) => {
    try {
      const allRatings = await storage.getAllRatings();
      const total = allRatings.length;
      const avg = total > 0 ? allRatings.reduce((s, r) => s + r.score, 0) / total : 0;
      const distribution = [1, 2, 3, 4, 5].map(s => ({
        score: s,
        count: allRatings.filter(r => r.score === s).length,
      }));
      res.json({ total, average: Math.round(avg * 10) / 10, distribution });
    } catch {
      res.status(500).json({ message: "Failed to fetch rating summary" });
    }
  });

  // ─── Settings Routes ─────────────────────────────────────────

  // Explicit blog-services endpoint (also accessible via generic /:key below)
  app.get("/api/settings/blog-services", authMiddleware, requireRole("root", "admin"), async (_req, res) => {
    try {
      const val = await storage.getSetting("blog_services");
      res.json({ key: "blog_services", value: val ?? null });
    } catch {
      res.status(500).json({ message: "Failed to fetch blog services" });
    }
  });

  app.put("/api/settings/blog-services", authMiddleware, requireRole("root", "admin"), async (req, res) => {
    try {
      const { value } = req.body;
      if (typeof value !== "string") {
        return res.status(400).json({ message: "Value must be a string" });
      }
      // Validate that value is a JSON array of {title, description} objects
      let parsed: unknown;
      try {
        parsed = JSON.parse(value);
      } catch {
        return res.status(400).json({ message: "Value must be valid JSON" });
      }
      if (!Array.isArray(parsed)) {
        return res.status(400).json({ message: "Value must be a JSON array" });
      }
      for (const item of parsed) {
        if (typeof item !== "object" || item === null) {
          return res.status(400).json({ message: "Each service entry must be an object" });
        }
        const entry = item as Record<string, unknown>;
        if (!("title" in entry) || typeof entry.title !== "string") {
          return res.status(400).json({ message: "Each service entry must have a title string" });
        }
        if ("description" in entry && typeof entry.description !== "string") {
          return res.status(400).json({ message: "Each service entry description must be a string" });
        }
      }
      await storage.setSetting("blog_services", value);
      res.json({ key: "blog_services", value });
    } catch {
      res.status(500).json({ message: "Failed to update blog services" });
    }
  });

  app.get("/api/settings/:key", authMiddleware, requireRole("root", "admin"), async (req, res) => {
    try {
      const val = await storage.getSetting(String(req.params.key));
      res.json({ key: req.params.key, value: val ?? null });
    } catch {
      res.status(500).json({ message: "Failed to fetch setting" });
    }
  });

  app.put("/api/settings/:key", authMiddleware, requireRole("root", "admin"), async (req, res) => {
    try {
      const { value } = req.body;
      if (typeof value !== "string") {
        return res.status(400).json({ message: "Value must be a string" });
      }
      await storage.setSetting(String(req.params.key), value);
      res.json({ key: req.params.key, value });
    } catch {
      res.status(500).json({ message: "Failed to update setting" });
    }
  });

  // ─── Funnel Analytics Routes ──────────────────────────────────

  app.get("/api/analytics/funnel", authMiddleware, requireRole("root", "admin"), async (_req, res) => {
    try {
      const allLeads = await storage.getLeads();
      const bySource: Record<string, { total: number; statuses: Record<string, number> }> = {};
      for (const lead of allLeads) {
        const source = lead.utmSource || "direct";
        if (!bySource[source]) bySource[source] = { total: 0, statuses: {} };
        bySource[source].total++;
        bySource[source].statuses[lead.status] = (bySource[source].statuses[lead.status] || 0) + 1;
      }
      const byCampaign: Record<string, { total: number; statuses: Record<string, number> }> = {};
      for (const lead of allLeads) {
        const campaign = lead.utmCampaign || "none";
        if (!byCampaign[campaign]) byCampaign[campaign] = { total: 0, statuses: {} };
        byCampaign[campaign].total++;
        byCampaign[campaign].statuses[lead.status] = (byCampaign[campaign].statuses[lead.status] || 0) + 1;
      }
      res.json({
        totalLeads: allLeads.length,
        bySource: Object.entries(bySource).map(([source, data]) => ({ source, ...data })),
        byCampaign: Object.entries(byCampaign).map(([campaign, data]) => ({ campaign, ...data })),
      });
    } catch {
      res.status(500).json({ message: "Failed to fetch funnel analytics" });
    }
  });

  // ─── SEO Management Routes ────────────────────────────────────

  app.get("/api/seo", authMiddleware, requireRole("root", "admin"), async (_req, res) => {
    try {
      const [globalRaw, pagesRaw, keywordsRaw] = await Promise.all([
        storage.getSetting("seo_global"),
        storage.getSetting("seo_pages"),
        storage.getSetting("seo_keywords"),
      ]);
      const parseSafe = (raw: string | null | undefined) => { try { return raw ? parseModelJson(raw) : null; } catch { return null; } };
      res.json({
        global: parseSafe(globalRaw),
        pages: parseSafe(pagesRaw),
        keywords: parseSafe(keywordsRaw),
      });
    } catch {
      res.status(500).json({ message: "Failed to fetch SEO settings" });
    }
  });

  app.put("/api/seo", authMiddleware, requireRole("root"), async (req, res) => {
    try {
      const { key, value } = req.body;
      const allowed = ["seo_global", "seo_pages", "seo_keywords"];
      if (!allowed.includes(key)) {
        return res.status(400).json({ message: "Invalid SEO key" });
      }
      await storage.setSetting(key, JSON.stringify(value));
      res.json({ success: true });
    } catch {
      res.status(500).json({ message: "Failed to update SEO setting" });
    }
  });

  // ─── Services CRUD ──────────────────────────────────────────────

  app.get("/api/services/public", async (_req, res) => {
    try {
      const all = await storage.getServices();
      res.json(all.filter((s) => s.isActive).sort((a, b) => a.displayOrder - b.displayOrder));
    } catch {
      res.status(500).json({ message: "Failed to fetch services" });
    }
  });

  app.get("/api/services/by-slug/:slug", async (req, res) => {
    try {
      const slug = `/${req.params.slug}`;
      const all = await storage.getServices();
      const service = all.find((s) => s.isActive && s.slug === slug);
      if (!service) return res.status(404).json({ message: "Service not found" });
      res.json(service);
    } catch {
      res.status(500).json({ message: "Failed to fetch service" });
    }
  });

  app.get("/api/services", authMiddleware, requireRole("root", "admin"), async (_req, res) => {
    try {
      const all = await storage.getServices();
      res.json(all);
    } catch {
      res.status(500).json({ message: "Failed to fetch services" });
    }
  });

  app.post("/api/services", authMiddleware, requireRole("root", "admin"), async (req, res) => {
    try {
      const { title } = req.body;
      if (!title || typeof title !== "string" || !title.trim()) {
        return res.status(400).json({ message: "Title is required" });
      }
      const all = await storage.getServices();
      const maxOrder = all.length > 0 ? Math.max(...all.map(s => s.displayOrder)) : -1;
      const service = await storage.createService({
        title: title.trim(),
        slug: slugify(title) + "-" + crypto.randomBytes(3).toString("hex"),
        badge: "",
        header: "",
        description: "",
        keyDetails: [],
        showPrice: false,
        price: null,
        isActive: true,
        displayOrder: maxOrder + 1,
      });
      res.status(201).json(service);
    } catch {
      res.status(500).json({ message: "Failed to create service" });
    }
  });

  app.patch("/api/services/:id", authMiddleware, requireRole("root", "admin"), async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (Number.isNaN(id)) {
        return res.status(400).json({ message: "Invalid service ID" });
      }
      const patchSchema = z.object({
        title: z.string().min(1).optional(),
        badge: z.string().optional(),
        header: z.string().optional(),
        description: z.string().optional(),
        keyDetails: z.array(z.string()).optional(),
        icon: z.string().optional(),
        slug: z.string().optional(),
        accentColor: z.string().optional(),
        showPrice: z.boolean().optional(),
        price: z.string().nullable().optional(),
        isActive: z.boolean().optional(),
        displayOrder: z.number().int().optional(),
      });
      const parsed = patchSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid fields", errors: parsed.error.errors });
      }
      const updates = parsed.data as Record<string, any>;
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }
      const service = await storage.updateService(id, updates);
      if (!service) {
        return res.status(404).json({ message: "Service not found" });
      }
      res.json(service);
    } catch {
      res.status(500).json({ message: "Failed to update service" });
    }
  });

  app.delete("/api/services/:id", authMiddleware, requireRole("root", "admin"), async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (Number.isNaN(id)) {
        return res.status(400).json({ message: "Invalid service ID" });
      }
      const existing = await storage.getServiceById(id);
      if (!existing) {
        return res.status(404).json({ message: "Service not found" });
      }
      await storage.deleteService(id);
      res.json({ message: "Service deleted" });
    } catch {
      res.status(500).json({ message: "Failed to delete service" });
    }
  });

  // ─── AI Service Content Generation ─────────────────────────────

  app.post("/api/ai/service-content", authMiddleware, requireRole("root", "admin"), async (req, res) => {
    try {
      const { serviceTitle, description, generateDescription, generatePricing, generateKeyDetails } = req.body;
      if (!serviceTitle) {
        return res.status(400).json({ message: "serviceTitle is required" });
      }
      if (!generateDescription && !generatePricing && !generateKeyDetails) {
        return res.status(400).json({ message: "At least one generation toggle must be enabled" });
      }

      const parts: string[] = [];
      if (generateDescription) parts.push("description");
      if (generatePricing) parts.push("pricing");
      if (generateKeyDetails) parts.push("keyDetails");

      const systemPrompt = `You are a marketing copywriter for Reign Services, DFW's premier interior and exterior renovation contractor. Write professional, confident, conversion-focused service copy. No exclamation points. No hype. Use clear, specific language. Target the Dallas-Fort Worth market.`;

      const userPrompt = `Write marketing copy for the following service: "${serviceTitle}"
${description ? `Current description for context: ${description}` : ""}

Generate only the requested fields. Respond in this exact JSON format:
{
  ${generateDescription ? `"description": "3-5 sentences of professional marketing copy describing the service, its value, and the quality of work.",` : ""}
  ${generatePricing ? `"price": "A natural free-text pricing note (e.g. 'Starting at $8/sq ft — final quote based on scope and materials'). Keep it short.",` : ""}
  ${generateKeyDetails ? `"keyDetails": ["Feature bullet 1", "Feature bullet 2", "Feature bullet 3", "Feature bullet 4", "Feature bullet 5"]` : ""}
}`;

      const response = await getOpenAI().chat.completions.create({
        model: freeModel(),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 1024,
      }, { timeout: 180000 });

      const raw = response.choices[0]?.message?.content || "{}";
      let result: { description?: string; price?: string; keyDetails?: string[] };
      try {
        result = parseModelJson(raw);
      } catch {
        result = {};
      }

      res.json({
        description: generateDescription ? (result.description || "") : undefined,
        price: generatePricing ? (result.price || "") : undefined,
        keyDetails: generateKeyDetails ? (Array.isArray(result.keyDetails) ? result.keyDetails : []) : undefined,
      });
    } catch {
      res.status(500).json({ message: "Failed to generate service content" });
    }
  });

  // ─── Gallery Routes (public) ──────────────────────────────────

  app.get("/api/gallery", async (_req, res) => {
    try {
      const gallery = await storage.getPublicGallery();
      res.json(gallery);
    } catch {
      res.status(500).json({ message: "Failed to fetch gallery" });
    }
  });

  app.get("/api/gallery/admin", authMiddleware, requireRole("root", "admin"), async (_req, res) => {
    try {
      const gallery = await storage.getAdminGallery();
      res.json(gallery);
    } catch {
      res.status(500).json({ message: "Failed to fetch admin gallery" });
    }
  });

  // ─── Gallery Section Management (root + admin) ────────────────

  app.get("/api/gallery/sections", authMiddleware, requireRole("root", "admin"), async (_req, res) => {
    try {
      const sections = await storage.getGallerySections();
      res.json(sections);
    } catch {
      res.status(500).json({ message: "Failed to fetch gallery sections" });
    }
  });

  app.post("/api/gallery/sections", authMiddleware, requireRole("root", "admin"), async (req, res) => {
    try {
      const { name, displayOrder, isActive } = req.body;
      if (!name) {
        return res.status(400).json({ message: "Section name is required" });
      }
      const section = await storage.createGallerySection({
        name,
        displayOrder: typeof displayOrder === "number" ? displayOrder : 0,
        isActive: isActive !== false,
      });
      res.status(201).json(section);
    } catch {
      res.status(500).json({ message: "Failed to create gallery section" });
    }
  });

  app.patch("/api/gallery/sections/:id", authMiddleware, requireRole("root", "admin"), async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
      const updates: Record<string, any> = {};
      if (req.body.name !== undefined) updates.name = req.body.name;
      if (typeof req.body.displayOrder === "number") updates.displayOrder = req.body.displayOrder;
      if (typeof req.body.isActive === "boolean") updates.isActive = req.body.isActive;
      const section = await storage.updateGallerySection(id, updates);
      if (!section) return res.status(404).json({ message: "Section not found" });
      res.json(section);
    } catch {
      res.status(500).json({ message: "Failed to update gallery section" });
    }
  });

  app.delete("/api/gallery/sections/:id", authMiddleware, requireRole("root", "admin"), async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
      await storage.deleteGallerySection(id);
      res.json({ message: "Section deleted" });
    } catch {
      res.status(500).json({ message: "Failed to delete gallery section" });
    }
  });

  // ─── Gallery Item Management (root + admin) ───────────────────

  app.post("/api/gallery/items", authMiddleware, requireRole("root", "admin"), async (req, res) => {
    try {
      const { sectionId, src, alt, badge, displayOrder, isActive } = req.body;
      if (!sectionId || !src || !alt) {
        return res.status(400).json({ message: "sectionId, src, and alt are required" });
      }
      const item = await storage.createGalleryItem({
        sectionId: parseInt(sectionId),
        src,
        alt,
        badge: badge || null,
        displayOrder: typeof displayOrder === "number" ? displayOrder : 0,
        isActive: isActive !== false,
      });
      res.status(201).json(item);
    } catch {
      res.status(500).json({ message: "Failed to create gallery item" });
    }
  });

  app.patch("/api/gallery/items/:id", authMiddleware, requireRole("root", "admin"), async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
      const updates: Record<string, any> = {};
      if (req.body.src !== undefined) updates.src = req.body.src;
      if (req.body.alt !== undefined) updates.alt = req.body.alt;
      if (req.body.badge !== undefined) updates.badge = req.body.badge || null;
      if (typeof req.body.displayOrder === "number") updates.displayOrder = req.body.displayOrder;
      if (typeof req.body.isActive === "boolean") updates.isActive = req.body.isActive;
      if (typeof req.body.sectionId === "number") updates.sectionId = req.body.sectionId;
      const item = await storage.updateGalleryItem(id, updates);
      if (!item) return res.status(404).json({ message: "Item not found" });
      res.json(item);
    } catch {
      res.status(500).json({ message: "Failed to update gallery item" });
    }
  });

  app.delete("/api/gallery/items/:id", authMiddleware, requireRole("root", "admin"), async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
      await storage.deleteGalleryItem(id);
      res.json({ message: "Item deleted" });
    } catch {
      res.status(500).json({ message: "Failed to delete gallery item" });
    }
  });

  return httpServer;
}
