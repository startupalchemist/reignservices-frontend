import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, serial, boolean, integer, jsonb, numeric, bigserial, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const leads = pgTable("leads", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email").notNull(),
  vehicle: text("vehicle").notNull(),
  insurance: text("insurance"),
  message: text("message"),
  status: text("status").notNull().default("New Lead"),
  loanerRequested: boolean("loaner_requested").default(false),
  pickupRequested: boolean("pickup_requested").default(false),
  insuranceApproved: boolean("insurance_approved").default(false),
  insuranceApprovalTimestamp: timestamp("insurance_approval_timestamp"),
  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertLeadSchema = createInsertSchema(leads).omit({
  id: true,
  createdAt: true,
  status: true,
  loanerRequested: true,
  pickupRequested: true,
  insuranceApproved: true,
  insuranceApprovalTimestamp: true,
});

export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leads.$inferSelect;

export const leadStatuses = [
  "New Lead",
  "Sale Closed",
  "Claim Initiated",
  "RA Signed",
  "Loaner Assigned",
  "Vehicle In Shop",
  "Scoped",
  "Estimate Sent",
  "First Look",
  "Supplement Submitted",
  "Awaiting Approval",
  "Approved",
  "R&I",
  "PDR",
  "QC 1",
  "Reinstall",
  "QC 2",
  "Detail",
  "Ready for Delivery",
  "Delivered",
  "Closed",
] as const;

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("editor"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  passwordHash: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const userRoles = ["root", "admin", "editor"] as const;

export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Session = typeof sessions.$inferSelect;

export const topics = pgTable("topics", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  overview: text("overview").notNull().default(""),
  targetKeywords: text("target_keywords").array().default(sql`'{}'::text[]`),
  searchIntent: text("search_intent"),
  estimatedSearchVolume: text("estimated_search_volume"),
  competitionLevel: text("competition_level"),
  leadPotential: text("lead_potential"),
  reasoning: text("reasoning"),
  status: text("status").notNull().default("suggested"),
  aiJobId: integer("ai_job_id"),
  postId: integer("post_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTopicSchema = createInsertSchema(topics).omit({
  id: true,
  createdAt: true,
  aiJobId: true,
  postId: true,
  status: true,
});

export type InsertTopic = z.infer<typeof insertTopicSchema>;
export type Topic = typeof topics.$inferSelect;
export const topicStatuses = ["suggested", "generating", "generated", "archived"] as const;

export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  content: text("content").notNull().default(""),
  excerpt: text("excerpt"),
  featuredImage: text("featured_image"),
  authorId: integer("author_id").references(() => users.id),
  status: text("status").notNull().default("draft"),
  tags: text("tags").array().default(sql`'{}'::text[]`),
  seoTitle: text("seo_title"),
  seoDescription: text("seo_description"),
  seoKeywords: text("seo_keywords").array().default(sql`'{}'::text[]`),
  researchJobId: integer("research_job_id"),
  topicId: integer("topic_id"),
  readCount: integer("read_count").notNull().default(0),
  shareCount: integer("share_count").notNull().default(0),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPostSchema = createInsertSchema(posts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  authorId: true,
});

export type InsertPost = z.infer<typeof insertPostSchema>;
export type Post = typeof posts.$inferSelect;

export const postStatuses = ["draft", "queued", "published"] as const;

export const subscribers = pgTable("subscribers", {
  id: serial("id").primaryKey(),
  name: text("name"),
  email: text("email").notNull().unique(),
  status: text("status").notNull().default("active"),
  unsubscribeToken: text("unsubscribe_token").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSubscriberSchema = createInsertSchema(subscribers).omit({
  id: true,
  createdAt: true,
  status: true,
  unsubscribeToken: true,
});

export type InsertSubscriber = z.infer<typeof insertSubscriberSchema>;
export type Subscriber = typeof subscribers.$inferSelect;

export const newsletters = pgTable("newsletters", {
  id: serial("id").primaryKey(),
  subject: text("subject").notNull(),
  htmlContent: text("html_content").notNull(),
  status: text("status").notNull().default("draft"),
  sentAt: timestamp("sent_at"),
  recipientCount: integer("recipient_count").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertNewsletterSchema = createInsertSchema(newsletters).omit({
  id: true,
  createdAt: true,
  status: true,
  sentAt: true,
  recipientCount: true,
});

export type InsertNewsletter = z.infer<typeof insertNewsletterSchema>;
export type Newsletter = typeof newsletters.$inferSelect;

export const aiJobs = pgTable("ai_jobs", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  input: text("input").notNull(),
  output: text("output"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AiJob = typeof aiJobs.$inferSelect;

export const backlinks = pgTable("backlinks", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(),
  url: text("url").notNull(),
  utmSource: text("utm_source").notNull(),
  utmMedium: text("utm_medium").notNull().default("referral"),
  utmCampaign: text("utm_campaign").notNull(),
  shortCode: text("short_code").notNull().unique(),
  clicks: integer("clicks").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Backlink = typeof backlinks.$inferSelect;

export const backlinkClicks = pgTable("backlink_clicks", {
  id: serial("id").primaryKey(),
  backlinkId: integer("backlink_id").notNull().references(() => backlinks.id, { onDelete: "cascade" }),
  referrer: text("referrer"),
  userAgent: text("user_agent"),
  clickedAt: timestamp("clicked_at").defaultNow().notNull(),
});

export type BacklinkClick = typeof backlinkClicks.$inferSelect;

export const webhookEvents = ["lead.created", "lead.updated", "post.published", "subscriber.created"] as const;

export const webhooks = pgTable("webhooks", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  events: text("events").array().notNull().default(sql`'{}'::text[]`),
  secret: text("secret").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertWebhookSchema = createInsertSchema(webhooks).omit({
  id: true,
  createdAt: true,
});

export type InsertWebhook = z.infer<typeof insertWebhookSchema>;
export type Webhook = typeof webhooks.$inferSelect;

export const webhookLogs = pgTable("webhook_logs", {
  id: serial("id").primaryKey(),
  webhookId: integer("webhook_id").notNull().references(() => webhooks.id, { onDelete: "cascade" }),
  event: text("event").notNull(),
  payload: text("payload").notNull(),
  statusCode: integer("status_code"),
  response: text("response"),
  success: boolean("success").notNull().default(false),
  duration: integer("duration"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type WebhookLog = typeof webhookLogs.$inferSelect;

export const ratings = pgTable("ratings", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id").references(() => leads.id, { onDelete: "cascade" }),
  score: integer("score").notNull(),
  channel: text("channel").notNull().default("email"),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Rating = typeof ratings.$inferSelect;

export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Setting = typeof settings.$inferSelect;

export const services = pgTable("services", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  badge: text("badge").notNull().default(""),
  header: text("header").notNull().default(""),
  description: text("description").notNull().default(""),
  keyDetails: text("key_details").array().default(sql`'{}'::text[]`),
  icon: text("icon").notNull().default("Wrench"),
  slug: text("slug").notNull().default(""),
  accentColor: text("accent_color").notNull().default("#5D3FD3"),
  showPrice: boolean("show_price").notNull().default(false),
  price: text("price"),
  isActive: boolean("is_active").notNull().default(true),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertServiceSchema = createInsertSchema(services).omit({
  id: true,
  createdAt: true,
});

export type InsertService = z.infer<typeof insertServiceSchema>;
export type Service = typeof services.$inferSelect;

export const gallerySections = pgTable("gallery_sections", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  displayOrder: integer("display_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertGallerySectionSchema = createInsertSchema(gallerySections).omit({ id: true, createdAt: true });
export type InsertGallerySection = z.infer<typeof insertGallerySectionSchema>;
export type GallerySection = typeof gallerySections.$inferSelect;

export const galleryItems = pgTable("gallery_items", {
  id: serial("id").primaryKey(),
  sectionId: integer("section_id").notNull().references(() => gallerySections.id, { onDelete: "cascade" }),
  src: text("src").notNull(),
  alt: text("alt").notNull(),
  badge: text("badge"),
  displayOrder: integer("display_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertGalleryItemSchema = createInsertSchema(galleryItems).omit({ id: true, createdAt: true });
export type InsertGalleryItem = z.infer<typeof insertGalleryItemSchema>;
export type GalleryItem = typeof galleryItems.$inferSelect;

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Operations tables mirror the versioned SQL migration. Do not run db:push in production.
export const reignMeasurements = pgTable("reign_measurements", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id").notNull().references(() => leads.id),
  label: text("label").notNull(), points: jsonb("points").notNull(), source: text("source").notNull(),
  areaSqFt: numeric("area_sq_ft").notNull(), perimeterFt: numeric("perimeter_ft").notNull(),
  verified: boolean("verified").notNull().default(false),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", {withTimezone:true}).notNull().defaultNow(),
});
export const reignProposals = pgTable("reign_proposals", {
  id: serial("id").primaryKey(), leadId: integer("lead_id").notNull().references(() => leads.id),
  document: jsonb("document").notNull(), status: text("status").notNull().default("draft"),
  version: integer("version").notNull().default(1),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
  updatedAt: timestamp("updated_at",{withTimezone:true}).notNull().defaultNow(),
  decidedAt: timestamp("decided_at",{withTimezone:true}), decidedBy: text("decided_by"),
});
export const reignPortalAccess = pgTable("reign_portal_access", {
  id: serial("id").primaryKey(),leadId:integer("lead_id").notNull().unique().references(()=>leads.id),
  tokenHash:text("token_hash").notNull().unique(),expiresAt:timestamp("expires_at",{withTimezone:true}).notNull(),
  createdBy:integer("created_by").notNull().references(()=>users.id),
  createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
});
export const reignAudit = pgTable("reign_audit", {
  id:bigserial("id",{mode:"number"}).primaryKey(),actorId:integer("actor_id").references(()=>users.id),
  action:text("action").notNull(),resource:text("resource").notNull(),detail:jsonb("detail").notNull().default({}),
  createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
});
export const reignAgentActions = pgTable("reign_agent_actions",{
  id:text("id").primaryKey(),actorId:integer("actor_id").notNull().references(()=>users.id),
  action:jsonb("action").notNull(),contextVersion:text("context_version").notNull(),
  expiresAt:timestamp("expires_at",{withTimezone:true}).notNull().default(sql`now()+interval '10 minutes'`),
  completedAt:timestamp("completed_at",{withTimezone:true}),
  createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
});
export const reignAiBudget = pgTable("reign_ai_budget",{
  day:date("day").primaryKey(),requests:integer("requests").notNull().default(0),
});
