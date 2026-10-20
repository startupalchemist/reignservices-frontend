import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import {createServer,Server} from "node:http";
import crypto from "node:crypto";
import {registerRoutes} from "../server/routes";
import {pool} from "../server/db";
import {storage} from "../server/storage";
import {hashPassword} from "../server/auth";
import {contextGraph,reserveInference} from "../server/reign-context";
import {registerAgents} from "../server/reign-agents";
let mockReply:string|undefined;let modelRequest:any;
const mockInference=(()=>({chat:{completions:{create:async(input:any)=>{modelRequest=input;if(!mockReply) throw new Error("Provider unavailable");return {choices:[{message:{content:mockReply}}]};}}}})) as any;
let server:Server,base:string,admin:string,editor:string,adminId:number,leadId:number,otherLead:number,serviceId:number,proposalId:number,portal:string,accessToken:string,measurement:number;
async function call(path:string,body?:unknown,cookie="",method=body===undefined?"GET":"POST"){
 const r=await fetch(base+path,{method,headers:{...(cookie?{cookie}:{}),...(body===undefined?{}:{"Content-Type":"application/json"})},body:body===undefined?undefined:JSON.stringify(body)});
 return {status:r.status,data:await r.json().catch(()=>null),cookie:r.headers.get("set-cookie")?.split(";")[0]||""};
}
before(async()=>{
 if(!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Integration suite requires a dedicated *_test database");
 delete process.env.OPENROUTER_API_KEY;
 const passwordHash=await hashPassword("Integration-test-password");
 adminId=(await storage.createUser({name:"Test Admin",email:"admin@test.invalid",passwordHash,role:"admin"})).id;
 await storage.createUser({name:"Test Editor",email:"editor@test.invalid",passwordHash,role:"editor"});
 leadId=(await storage.createLead({name:"Customer One",email:"one@test.invalid",phone:"555",vehicle:"Turf"})).id;
 otherLead=(await storage.createLead({name:"Customer Two",email:"two@test.invalid",phone:"555",vehicle:"Patio"})).id;
 serviceId=(await storage.createService({title:"Turf",slug:"test-turf",description:"Premium turf",isActive:true})).id;
 const app=express();app.use(express.json());app.use(cookieParser());server=createServer(app);
 registerAgents(app,mockInference);
 await registerRoutes(server,app);
 app.use((error:any,_req:any,res:any,_next:any)=>res.status(error.status||500).json({message:"Server error"}));
 await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
 base="http://127.0.0.1:"+(server.address() as any).port;
 admin=(await call("/api/auth/login",{email:"ADMIN@TEST.INVALID",password:"Integration-test-password"})).cookie;
 editor=(await call("/api/auth/login",{email:"editor@test.invalid",password:"Integration-test-password"})).cookie;
 assert.ok(admin);assert.ok(editor);
});
after(async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));await pool.end();});
test("Staff operations reject anonymous and editor requests, including mutations",async()=>{
 assert.equal((await call("/api/operations/context")).status,401);
 assert.equal((await call("/api/operations/actions",{type:"service.delete",id:serviceId},editor)).status,403);
 assert.equal((await call("/api/operations/proposals",undefined,editor)).status,403);
});
test("Blog lifecycle protects drafts by slug and numeric ID, allows staff preview and published reads",async()=>{
 const draft=await call("/api/posts",{title:"Draft hidden",content:"## Draft\nPrivate work",status:"draft"},admin);
 assert.equal(draft.status,201);
 assert.equal((await call("/api/posts/"+draft.data.id)).status,404);
 assert.equal((await call("/api/posts/"+draft.data.slug)).status,404);
 assert.equal((await call("/api/posts?status=draft")).data.length,0);
 assert.equal((await call("/api/posts/"+draft.data.id,undefined,editor)).status,200);
 assert.equal((await call("/api/posts/"+draft.data.id,{content:"## Final\nPublished article"},admin,"PATCH")).status,200);
 assert.equal((await call("/api/posts/"+draft.data.id+"/publish",{},admin)).status,200);
 assert.equal((await call("/api/posts/"+draft.data.slug)).status,200);
 assert.equal((await call("/api/posts/"+draft.data.id+"/publish",{},admin)).status,200);
 const links=await pool.query("SELECT url FROM backlinks WHERE post_id=$1",[draft.data.id]);
 assert.equal(links.rowCount,5);assert.ok(links.rows.every(r=>r.url.startsWith("https://getreignservices.com/blog/")));
 const newsletters=await pool.query("SELECT status FROM newsletters WHERE subject=$1",[draft.data.title]);
 assert.equal(newsletters.rowCount,1);assert.equal(newsletters.rows[0].status,"draft");
 assert.equal((await call("/api/posts/"+draft.data.id,undefined,admin,"DELETE")).status,200);
 assert.equal((await call("/api/posts/"+draft.data.slug)).status,404);
});
test("Context graph updates immediately after CMS edits/deletes and hides inactive services",async()=>{
 const original=await contextGraph();
 const created=await call("/api/operations/actions",{type:"service.create",data:{title:"New service",slug:"new-service",description:"Newest CMS service",isActive:true}},admin);
 assert.equal(created.status,201);
 assert.notEqual((await contextGraph()).version,original.version);
 assert.ok((await contextGraph()).services.some(s=>s.id===created.data.id));
 await call("/api/services/"+created.data.id,{isActive:false},admin,"PATCH");
 assert.ok(!(await contextGraph()).services.some(s=>s.id===created.data.id));
 assert.ok((await contextGraph(true)).services.some(s=>s.id===created.data.id));
 await call("/api/operations/actions",{type:"service.delete",id:created.data.id},admin);
 assert.ok(!(await contextGraph(true)).services.some(s=>s.id===created.data.id));
});
test("Rate cards and measurements gate proposal generation",async()=>{
 const data={leadId,title:"Backyard transformation",scope:"Install approved turf. Scheduling confirmed separately.",lines:[{serviceId,quantity:600}],taxBasisPoints:0};
 assert.equal((await call("/api/operations/actions",{type:"proposal.create",data},admin)).status,400);
 assert.equal((await call("/api/operations/actions",{type:"rates.set",rates:[{serviceId,unit:"sq ft",unitPriceCents:1200,minimumCents:0}]},admin)).status,201);
 const m=await call("/api/operations/measurements",{leadId,label:"Yard",source:"Measured site survey",points:[[0,0],[30,0],[30,20],[0,20]]},admin);
 assert.equal(m.status,201);assert.equal(Number(m.data.area_sq_ft),600);measurement=m.data.id;
 const withMeasurement={...data,lines:[{serviceId,quantity:600,measurementId:measurement}]};
 assert.equal((await call("/api/operations/actions",{type:"proposal.create",data:withMeasurement},admin)).status,400);
 await call("/api/operations/measurements/"+measurement+"/verify",{},admin);
 assert.equal((await call("/api/operations/actions",{type:"proposal.create",data:{...data,lines:[{serviceId,quantity:1,measurementId:measurement}]}},admin)).status,400);
 const p=await call("/api/operations/actions",{type:"proposal.create",data:withMeasurement},admin);
 assert.equal(p.status,201);assert.equal(p.data.document.totalCents,720000);proposalId=p.data.id;
});
test("Customer portal only shows its lead's issued proposals, decisions cannot cross customer boundaries",async()=>{
 const link=await call("/api/operations/portal-access",{leadId},admin);
 accessToken=link.data.url.split("#")[1];
 portal=(await call("/api/portal/session",{token:accessToken})).cookie;
 assert.equal((await call("/api/portal/me",undefined,portal)).data.proposals.length,0);
 assert.equal((await call("/api/portal/me")).status,401);
 assert.equal((await call("/api/operations/proposals/"+proposalId+"/issue",{version:1},admin)).status,200);
 assert.equal((await call("/api/operations/proposals/"+proposalId+"/issue",{version:1},admin)).status,409);
 const p=(await call("/api/portal/me",undefined,portal)).data.proposals[0];
 assert.equal(p.id,proposalId);
 const other=await call("/api/operations/portal-access",{leadId:otherLead},admin);
 const otherCookie=(await call("/api/portal/session",{token:other.data.url.split("#")[1]})).cookie;
 assert.equal((await call("/api/portal/me",undefined,otherCookie)).data.proposals.length,0);
 assert.equal((await call("/api/portal/proposals/"+proposalId+"/decision",{version:p.version,name:"Wrong Customer",decision:"accepted"},otherCookie)).status,409);
 assert.equal((await call("/api/portal/proposals/"+proposalId+"/decision",{version:p.version,name:"Customer One",decision:"accepted"},portal)).status,200);
 assert.equal((await call("/api/portal/proposals/"+proposalId+"/decision",{version:p.version,name:"Customer One",decision:"accepted"},portal)).status,409);
 assert.equal((await call("/api/operations/proposals/"+proposalId+"/withdraw",{version:3},admin)).status,409);
});
test("Portal revocation and expiry invalidate access; link rotation revokes earlier sessions",async()=>{
 await call("/api/operations/portal-access",{leadId},admin);
 assert.equal((await call("/api/portal/me",undefined,portal)).status,401);
 assert.equal((await call("/api/portal/session",{token:accessToken})).status,401);
 const link=await call("/api/operations/portal-access",{leadId},admin);
 const token=link.data.url.split("#")[1];
 await pool.query("UPDATE reign_portal_access SET expires_at=now()-interval '1 second' WHERE lead_id=$1",[leadId]);
 assert.equal((await call("/api/portal/session",{token})).status,401);
 await call("/api/operations/portal-access/"+leadId,undefined,admin,"DELETE");
});
test("Agent actions require the owning staff account, fresh context, and one-time confirmation",async()=>{
 const id=crypto.randomUUID(),graph=await contextGraph(true);
 const action={type:"config.set",key:"reign_consultation_message",value:"Book a free consultation"};
 await pool.query("INSERT INTO reign_agent_actions(id,actor_id,action,context_version) VALUES($1,$2,$3,$4)",[id,adminId,JSON.stringify(action),graph.version]);
 assert.equal((await call("/api/operations/agent/actions/"+id+"/confirm",{},editor)).status,403);
 assert.equal((await call("/api/operations/agent/actions/"+id+"/confirm",{},admin)).status,200);
 assert.equal((await call("/api/operations/agent/actions/"+id+"/confirm",{},admin)).status,409);
 const stale=crypto.randomUUID();
 await pool.query("INSERT INTO reign_agent_actions(id,actor_id,action,context_version) VALUES($1,$2,$3,$4)",[stale,adminId,JSON.stringify(action),graph.version]);
 assert.equal((await call("/api/operations/agent/actions/"+stale+"/confirm",{},admin)).status,409);
 assert.equal((await call("/api/operations/actions",{type:"config.set",key:"OPENROUTER_API_KEY",value:"bad"},admin)).status,400);
});
test("Sales agent retains consultation fallback when inference is unconfigured",async()=>{
 const response=await call("/api/sales-agent",{messages:[{role:"user",content:"I need a new yard"}]});
 assert.equal(response.status,200);assert.equal(response.data.fallback,true);assert.equal(response.data.consultation.url,"/contact");
});

test("Staff agent uses fresh CMS/tool facts and returns validated pending changes rather than executing them",async()=>{
 const before=await storage.getServiceById(serviceId);
 mockReply=JSON.stringify({reply:"Prepared a service update for your review.",actions:[{type:"service.update",id:serviceId,data:{description:"Updated by confirmed assistant"}}]});
 const result=await call("/api/operations/agent",{messages:[{role:"user",content:"Update the turf description"}]},admin);
 assert.equal(result.status,200);assert.equal(result.data.pending.length,1);
 assert.equal((await storage.getServiceById(serviceId))?.description,before?.description);
 assert.ok(modelRequest.messages[0].content.includes("Customer One"));
 assert.ok(modelRequest.messages[0].content.includes("Turf"));
 const id=result.data.pending[0].id;
 assert.equal((await call("/api/operations/agent/actions/"+id+"/confirm",{},admin)).status,200);
 assert.equal((await storage.getServiceById(serviceId))?.description,"Updated by confirmed assistant");
 mockReply=JSON.stringify({reply:"Invalid action",actions:[{type:"config.set",key:"OPENROUTER_API_KEY",value:"leak"}]});
 assert.equal((await call("/api/operations/agent",{messages:[{role:"user",content:"Change a secret"}]},admin)).status,400);
 mockReply=undefined;
});
test("Shared daily free-inference budget fails closed when exhausted",async()=>{
 process.env.AI_DAILY_REQUEST_LIMIT="2";
 await reserveInference();await reserveInference();await assert.rejects(reserveInference(),/budget reached/);
 delete process.env.AI_DAILY_REQUEST_LIMIT;
});

test("Mail configuration failures do not count as sent; attempted newsletters cannot be resent",async()=>{
 delete process.env.RESEND_API_KEY;delete process.env.RESEND_FROM_EMAIL;delete process.env.REPL_IDENTITY;delete process.env.WEB_REPL_RENEWAL;
 await pool.query("INSERT INTO subscribers(email,unsubscribe_token) VALUES('mail-test@example.invalid','test-unsubscribe')");
 const r=await call("/api/newsletters",{subject:"Integration newsletter",htmlContent:"<p>Test only</p>"},admin);
 assert.equal(r.status,201);
 assert.equal((await call("/api/newsletters/"+r.data.id+"/send",{},admin)).status,503);
 let row=(await pool.query("SELECT status,recipient_count FROM newsletters WHERE id=$1",[r.data.id])).rows[0];
 assert.equal(row.status,"draft");assert.equal(row.recipient_count,0);
 await pool.query("UPDATE newsletters SET status='review_required' WHERE id=$1",[r.data.id]);
 assert.equal((await call("/api/newsletters/"+r.data.id+"/send",{},admin)).status,409);
});
