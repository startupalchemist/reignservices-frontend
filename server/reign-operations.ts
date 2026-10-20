import type { Express, Request, Response, NextFunction } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { pool } from "./db";
import { storage } from "./storage";
import { authMiddleware, requireRole } from "./auth";
import { calculateProposal, proposalInput, measurementInput, measurePolygon, rateSchema } from "./operations-domain";
import { contextGraph } from "./reign-context";
import { publicBaseUrl } from "./inference";

const idSchema=z.coerce.number().int().positive();
const digest=(value:string)=>crypto.createHash("sha256").update(value).digest("hex");
export const serviceFields=z.object({
  title:z.string().trim().min(1).max(200).optional(),
  description:z.string().max(10000).optional(),header:z.string().max(300).optional(),
  badge:z.string().max(100).optional(),slug:z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100).optional(),
  keyDetails:z.array(z.string().max(1000)).max(30).optional(),isActive:z.boolean().optional(),
  showPrice:z.boolean().optional(),price:z.string().max(300).nullable().optional(),
}).strict();
export const actionSchema=z.discriminatedUnion("type",[
  z.object({type:z.literal("service.create"),data:serviceFields.extend({title:z.string().trim().min(1).max(200),slug:z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100)})}).strict(),
  z.object({type:z.literal("service.update"),id:idSchema,data:serviceFields}).strict(),
  z.object({type:z.literal("service.delete"),id:idSchema}).strict(),
  z.object({type:z.literal("rates.set"),rates:z.array(rateSchema).max(100)}).strict(),
  z.object({type:z.literal("config.set"),key:z.literal("reign_consultation_message"),value:z.string().trim().min(1).max(1000)}).strict(),
  z.object({type:z.literal("measurement.create"),data:measurementInput}).strict(),
  z.object({type:z.literal("proposal.create"),data:proposalInput}).strict(),
  z.object({type:z.literal("proposal.update"),id:idSchema,version:idSchema,data:proposalInput}).strict(),
]);
export const staff=[authMiddleware,requireRole("root","admin")];
export function handled(fn:(req:Request,res:Response)=>Promise<unknown>) {
  return (req:Request,res:Response,next:NextFunction)=>{Promise.resolve(fn(req,res)).catch(error=>{
    if(error instanceof z.ZodError) return res.status(400).json({message:"Invalid input",issues:error.issues});
    if(error.status) return res.status(error.status).json({message:error.message});
    next(error);
  });};
}
export function fail(message:string,status=400):never {throw Object.assign(new Error(message),{status});}
export async function audit(actor:number,action:string,resource:string,detail:unknown={}) {
  await pool.query("INSERT INTO reign_audit(actor_id,action,resource,detail) VALUES($1,$2,$3,$4)",[actor,action,resource,JSON.stringify(detail)]);
}
async function proposalDocument(data:z.infer<typeof proposalInput>) {
  if(!await storage.getLead(data.leadId)) fail("Customer lead not found",404);
  const graph=await contextGraph(true);
  for(const line of data.lines) if(line.measurementId) {
    const m=(await pool.query("SELECT * FROM reign_measurements WHERE id=$1 AND lead_id=$2",[line.measurementId,data.leadId])).rows[0];
    if(!m || !m.verified) fail("Measurement requires staff verification");
    const rate=graph.rates.find(r=>r.serviceId===line.serviceId);
    const expected=rate?.unit==="sq ft"?Number(m.area_sq_ft):rate?.unit==="linear ft"?Number(m.perimeter_ft):null;
    if(expected===null || Math.abs(expected-line.quantity)>0.01) fail("Quantity must match the verified measurement and pricing unit");
  }
  try{return calculateProposal(data,graph.rates,graph.services);}
  catch(e){fail((e as Error).message);}
}
export async function executeAction(actor:number,raw:unknown) {
  const action=actionSchema.parse(raw);
  if(action.type==="service.create") {
    if((await storage.getServices()).some(s=>s.slug===action.data.slug)) fail("Service slug already exists",409);
    return storage.createService({...action.data,badge:action.data.badge||"",header:action.data.header||"",description:action.data.description||"",isActive:action.data.isActive??true});
  }
  if(action.type==="service.update") {
    if(action.data.slug && (await storage.getServices()).some(s=>s.id!==action.id && s.slug===action.data.slug)) fail("Service slug already exists",409);
    const result=await storage.updateService(action.id,action.data);
    if(!result) fail("Service not found",404); return result;
  }
  if(action.type==="service.delete") {
    if(!await storage.getServiceById(action.id)) fail("Service not found",404);
    await storage.deleteService(action.id); return {deleted:action.id};
  }
  if(action.type==="rates.set") {
    const services=await storage.getServices();
    if(new Set(action.rates.map(r=>r.serviceId)).size!==action.rates.length || action.rates.some(r=>!services.some(s=>s.id===r.serviceId))) fail("Rates require unique existing service IDs");
    await storage.setSetting("reign_rate_card",JSON.stringify(action.rates)); return {rates:action.rates};
  }
  if(action.type==="config.set") {await storage.setSetting(action.key,action.value);return {key:action.key,value:action.value};}
  if(action.type==="measurement.create") {
    const input=action.data;
    if(!await storage.getLead(input.leadId)) fail("Lead not found",404);
    let result;try{result=measurePolygon(input.points);}catch(e){fail((e as Error).message);}
    return (await pool.query("INSERT INTO reign_measurements(lead_id,label,points,source,area_sq_ft,perimeter_ft,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
      [input.leadId,input.label,JSON.stringify(input.points),input.source,result.areaSqFt,result.perimeterFt,actor])).rows[0];
  }
  const document=await proposalDocument(action.data);
  if(action.type==="proposal.create") return (await pool.query(
    "INSERT INTO reign_proposals(lead_id,document,created_by) VALUES($1,$2,$3) RETURNING *",
    [action.data.leadId,JSON.stringify(document),actor])).rows[0];
  const result=await pool.query("UPDATE reign_proposals SET lead_id=$1,document=$2,version=version+1,updated_at=now() WHERE id=$3 AND version=$4 AND status='draft' RETURNING *",
    [action.data.leadId,JSON.stringify(document),action.id,action.version]);
  if(!result.rowCount) fail("Proposal changed or is no longer a draft",409);
  return result.rows[0];
}
export function registerOperations(app:Express) {
  app.get("/api/operations/context",...staff,handled(async(_req,res)=>res.json(await contextGraph(true))));
  app.get("/api/operations/proposals",...staff,handled(async(_req,res)=>res.json((await pool.query("SELECT * FROM reign_proposals ORDER BY id DESC LIMIT 200")).rows)));
  app.post("/api/operations/actions",...staff,handled(async(req,res)=>{
    const action=actionSchema.parse(req.body);
    const result=await executeAction(req.user!.id,action);
    await audit(req.user!.id,action.type,"operations",{action,result});
    res.status(201).json(result);
  }));
  app.post("/api/operations/proposals/:id/:transition",...staff,handled(async(req,res)=>{
    const id=idSchema.parse(req.params.id);
    const version=idSchema.parse(req.body.version);
    const transition=z.enum(["issue","withdraw"]).parse(req.params.transition);
    const from=transition==="issue"?"draft":"issued",to=transition==="issue"?"issued":"withdrawn";
    const result=await pool.query("UPDATE reign_proposals SET status=$1,version=version+1,updated_at=now() WHERE id=$2 AND version=$3 AND status=$4 RETURNING *",[to,id,version,from]);
    if(!result.rowCount) fail("Proposal changed or transition is not allowed",409);
    await audit(req.user!.id,"proposal."+transition,String(id));
    res.json(result.rows[0]);
  }));
  app.get("/api/operations/measurements",...staff,handled(async(_req,res)=>res.json((await pool.query("SELECT * FROM reign_measurements ORDER BY id DESC LIMIT 200")).rows)));
  app.post("/api/operations/measurements",...staff,handled(async(req,res)=>{
    const saved=await executeAction(req.user!.id,{type:"measurement.create",data:req.body});
    await audit(req.user!.id,"measurement.create",String(saved.id));res.status(201).json(saved);
  }));
  app.post("/api/operations/measurements/:id/verify",...staff,handled(async(req,res)=>{
    const result=await pool.query("UPDATE reign_measurements SET verified=true WHERE id=$1 RETURNING *",[idSchema.parse(req.params.id)]);
    if(!result.rowCount) fail("Measurement not found",404);
    await audit(req.user!.id,"measurement.verify",String(req.params.id));res.json(result.rows[0]);
  }));
  app.post("/api/operations/portal-access",...staff,handled(async(req,res)=>{
    const leadId=idSchema.parse(req.body.leadId);
    if(!await storage.getLead(leadId)) fail("Lead not found",404);
    const token=crypto.randomBytes(32).toString("hex");
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      await client.query("DELETE FROM reign_portal_access WHERE lead_id=$1",[leadId]);
      await client.query("INSERT INTO reign_portal_access(lead_id,token_hash,expires_at,created_by) VALUES($1,$2,now()+interval '30 days',$3)",[leadId,digest(token),req.user!.id]);
      await client.query("COMMIT");
    }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
    await audit(req.user!.id,"portal.invite",String(leadId));
    res.status(201).json({url:publicBaseUrl()+"/portal#"+token,expiresInDays:30});
  }));
  app.delete("/api/operations/portal-access/:leadId",...staff,handled(async(req,res)=>{
    const leadId=idSchema.parse(req.params.leadId);
    await pool.query("DELETE FROM reign_portal_access WHERE lead_id=$1",[leadId]);
    await audit(req.user!.id,"portal.revoke",String(leadId));res.sendStatus(204);
  }));
  app.get("/api/operations/audit",...staff,handled(async(_req,res)=>res.json((await pool.query("SELECT id,actor_id,action,resource,created_at FROM reign_audit ORDER BY id DESC LIMIT 100")).rows)));

  app.use("/api/portal",(_req,res,next)=>{res.set("Cache-Control","no-store");res.set("Referrer-Policy","no-referrer");next();});
  app.post("/api/portal/session",handled(async(req,res)=>{
    const token=z.string().regex(/^[a-f0-9]{64}$/).parse(req.body.token);
    const access=(await pool.query("SELECT id FROM reign_portal_access WHERE token_hash=$1 AND expires_at>now()",[digest(token)])).rows[0];
    if(!access) fail("This access link has expired or was revoked",401);
    res.cookie("reign_portal",token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",maxAge:30*86400000,path:"/api/portal"});
    res.json({ok:true});
  }));
  app.post("/api/portal/logout",(_req,res)=>{res.clearCookie("reign_portal",{path:"/api/portal"});res.sendStatus(204);});
  async function access(req:Request) {
    const token=req.cookies?.reign_portal;
    if(typeof token!=="string"||!/^[a-f0-9]{64}$/.test(token)) fail("Customer access required",401);
    const a=(await pool.query("SELECT * FROM reign_portal_access WHERE token_hash=$1 AND expires_at>now()",[digest(token)])).rows[0];
    if(!a) fail("Customer access expired",401);return a;
  }
  app.get("/api/portal/me",handled(async(req,res)=>{
    const a=await access(req),lead=await storage.getLead(a.lead_id);
    const proposals=(await pool.query("SELECT id,document,status,version,updated_at,decided_at FROM reign_proposals WHERE lead_id=$1 AND status<>'draft' ORDER BY id DESC",[a.lead_id])).rows;
    res.json({customer:{name:lead?.name,project:lead?.vehicle,status:lead?.status},proposals});
  }));
  app.post("/api/portal/proposals/:id/decision",handled(async(req,res)=>{
    const a=await access(req);
    const input=z.object({version:idSchema,decision:z.enum(["accepted","declined"]),name:z.string().trim().min(2).max(200)}).strict().parse(req.body);
    const result=await pool.query("UPDATE reign_proposals SET status=$1,decided_by=$2,decided_at=now(),version=version+1,updated_at=now() WHERE id=$3 AND lead_id=$4 AND status='issued' AND version=$5 RETURNING id,status,version",
      [input.decision,input.name,idSchema.parse(req.params.id),a.lead_id,input.version]);
    if(!result.rowCount) fail("Proposal changed or is unavailable",409);
    await pool.query("INSERT INTO reign_audit(action,resource,detail) VALUES('portal.decision',$1,$2)",[String(req.params.id),JSON.stringify({leadId:a.lead_id,decision:input.decision})]);
    res.json(result.rows[0]);
  }));
}
