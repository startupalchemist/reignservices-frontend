import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import {createServer,Server} from "node:http";
import sharp from "sharp";
import {pool} from "../server/db";
import {storage} from "../server/storage";
import {hashPassword} from "../server/auth";
import {registerRoutes} from "../server/routes";
import {registerSitePlans} from "../server/site-plans";
let server:Server,base:string,root:string,admin:string,editor:string,leadId:number,plan:any,imageData:string,logo:string,visionCalls=0;
let visionReply:any={summary:"Visible work surface",shapes:[{label:"Yard & lawn",kind:"turf",confidence:"medium",notes:"Estimate",points:[[.2,.2],[.6,.2],[.6,.7],[.2,.7]]}]};
async function call(url:string,body?:any,cookie=root,method=body===undefined?"GET":"POST"){
 const r=await fetch(base+url,{method,headers:{cookie,"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)});
 return {status:r.status,data:await r.json().catch(()=>null),cookie:r.headers.get("set-cookie")?.split(";")[0]||""};
}
const setSubscription=(tier="starter",status="active",end:string|null=null)=>call("/api/operations/branding/subscription",{tier,status,currentPeriodEnd:end},root,"PATCH");
const future=()=>new Date(Date.now()+86400000).toISOString();
before(async()=>{
 if(!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test"))throw new Error("Requires dedicated test database");
 process.env.LAUNCHWORKS_TENANT_ID="site-tests";
 const hash=await hashPassword("Site-test-password");
 for(const role of ["root","admin","editor"])await storage.createUser({name:"Site "+role,email:"site-"+role+"@test.invalid",role,passwordHash:hash});
 leadId=(await storage.createLead({name:"Aerial Test",email:"aerial@test.invalid",phone:"555",vehicle:"Turf"})).id;
 imageData="data:image/jpeg;base64,"+(await sharp({create:{width:768,height:768,channels:3,background:"#274d3a"}}).jpeg().toBuffer()).toString("base64");
 logo="data:image/png;base64,"+(await sharp({create:{width:80,height:30,channels:4,background:"#f4ce83"}}).png().toBuffer()).toString("base64");
 const app=express();app.use(express.json());app.use(cookieParser());server=createServer(app);
 registerSitePlans(app,{
  locateAddress:async()=>({lat:32.78,lng:-96.8,address:"Public Test Site"}),
  fetchImagery:async()=>({imageData,provider:"usgs-naip",attribution:"USGS, USDA, The National Map",feetPerPixel:.4,metersPerPixel:.12192,retrievedAt:new Date().toISOString()}),
  getVisionInference:(()=>({chat:{completions:{create:async()=>{visionCalls++;return{choices:[{message:{content:JSON.stringify(visionReply)}}]};}}}})) as any,
 });
 await registerRoutes(server,app);
 app.use((e:any,_req:any,res:any,_next:any)=>res.status(e.status||500).json({message:"Server error"}));
 await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));base="http://127.0.0.1:"+(server.address() as any).port;
 const login=(role:string)=>call("/api/auth/login",{email:"site-"+role+"@test.invalid",password:"Site-test-password"},"");
 root=(await login("root")).cookie;admin=(await login("admin")).cookie;editor=(await login("editor")).cookie;assert.ok(root&&admin&&editor);
});
after(async()=>{await new Promise<void>(r=>server.close(()=>r()));await pool.end();});
test("Imagery and branding require staff, tenant IDs cannot be supplied, tenant admins cannot upgrade subscriptions",async()=>{
 assert.equal((await call("/api/operations/site-plans",undefined,"")).status,401);
 assert.equal((await call("/api/operations/branding",undefined,editor)).status,403);
 assert.equal((await call("/api/operations/branding/subscription",{tier:"white_label",status:"active",currentPeriodEnd:future()},admin,"PATCH")).status,403);
 assert.equal((await call("/api/operations/branding",{name:"Tenant",logo:null,tier:"white_label"},admin,"PATCH")).status,400);
 assert.equal((await call("/api/operations/site-plans",{leadId,address:"Public address",tenantId:"another"})).status,400);
 assert.equal((await call("/api/operations/branding/platform-logo",{logo},admin,"PATCH")).status,403);
});
test("Starter exports preserve platform and imagery attribution; forged premium export modes are forbidden",async()=>{
 const created=await call("/api/operations/site-plans",{leadId,address:"Public address"});assert.equal(created.status,201);plan=created.data;assert.equal(plan.image_data,undefined);
 const raw=await fetch(base+"/api/operations/site-plans/"+plan.id+"/image",{headers:{cookie:root}});assert.equal(raw.status,200);
 let r=await fetch(base+"/api/operations/site-plans/"+plan.id+"/export?format=svg&mode=platform",{headers:{cookie:root}});
 assert.equal(r.status,200);const svg=await r.text();assert.match(svg,/LaunchWorks/);assert.match(svg,/USGS/);assert.match(svg,/PRELIMINARY/);
 assert.equal((await call("/api/operations/site-plans/"+plan.id+"/export?mode=dual")).status,403);
 assert.equal((await call("/api/operations/site-plans/"+plan.id+"/export?mode=tenant")).status,403);
});
test("Pro enables co-branding, White Label removes platform marks; live status and expiry are rechecked on each export",async()=>{
 assert.equal((await setSubscription("pro","active",future())).status,200);
 assert.equal((await call("/api/operations/branding",{name:"Tenant <script>",logo},admin,"PATCH")).status,200);
 let r=await fetch(base+"/api/operations/site-plans/"+plan.id+"/export?format=svg&mode=dual",{headers:{cookie:root}});
 assert.equal(r.status,200);assert.match(await r.text(),/data:image\/png;base64/);
 assert.equal((await call("/api/operations/site-plans/"+plan.id+"/export?mode=tenant")).status,403);
 assert.equal((await setSubscription("white_label","active",future())).status,200);
 r=await fetch(base+"/api/operations/site-plans/"+plan.id+"/export?format=svg&mode=tenant",{headers:{cookie:root}});
 const svg=await r.text();assert.equal(r.status,200);assert.ok(!svg.includes("LaunchWorks"));assert.ok(!svg.includes("TachyonXLabs"));assert.match(svg,/USGS/);assert.ok(!svg.includes("<script>"));
 r=await fetch(base+"/api/operations/site-plans/"+plan.id+"/export?format=png&mode=tenant",{headers:{cookie:admin}});
 assert.equal(r.status,200);assert.equal(Buffer.from(await r.arrayBuffer()).subarray(0,8).toString("hex"),"89504e470d0a1a0a");
 for(const [status,end] of [["past_due",future()],["canceled",future()],["paused",future()],["active",new Date(Date.now()-1000).toISOString()]]){
  assert.equal((await setSubscription("white_label",status,end)).status,200);
  assert.equal((await call("/api/operations/site-plans/"+plan.id+"/export?mode=tenant",undefined,admin)).status,403);
 }
 assert.equal((await setSubscription("white_label","active",null)).status,400);
 assert.equal((await setSubscription("pro","trialing",future())).status,200);
 assert.equal((await call("/api/operations/branding")).data.entitlements.modes.includes("dual"),true);
});
test("AI outlines calculate geometry, stale edits fail, review is invalidated by edits, estimates require separate field verification",async()=>{
 const result=await call("/api/operations/site-plans/"+plan.id+"/analyze",{version:plan.version});
 assert.equal(result.status,200);plan=result.data;assert.ok(plan.document.annotations.shapes[0].areaSqFt>0);assert.equal(plan.reviewed_at,null);
 let p=await call("/api/operations/site-plans/"+plan.id+"/measurements",{version:plan.version,shapeIndex:0});assert.equal(p.status,409);
 p=await call("/api/operations/site-plans/"+plan.id+"/review",{version:plan.version});assert.equal(p.status,200);plan=p.data;
 const m=await call("/api/operations/site-plans/"+plan.id+"/measurements",{version:plan.version,shapeIndex:0});
 assert.equal(m.status,201);assert.equal(m.data.verified,false);assert.equal(m.data.lead_id,leadId);
 const ann={summary:"Staff checked",shapes:visionReply.shapes};
 assert.equal((await call("/api/operations/site-plans/"+plan.id,{version:1,annotations:ann},root,"PATCH")).status,409);
 p=await call("/api/operations/site-plans/"+plan.id,{version:plan.version,annotations:ann},root,"PATCH");assert.equal(p.status,200);plan=p.data;assert.equal(plan.reviewed_at,null);
 const beforeVersion=plan.version;visionReply={summary:"Invalid",shapes:[{label:"Bad",kind:"turf",confidence:"high",notes:"",points:[[0,0],[1,1],[0,1],[1,0]]}]};
 assert.equal((await call("/api/operations/site-plans/"+plan.id+"/analyze",{version:plan.version})).status,502);
 const saved=(await call("/api/operations/site-plans")).data.find((x:any)=>x.id===plan.id);assert.equal(saved.version,beforeVersion);
 await setSubscription("starter","canceled",null);
 const before=visionCalls;assert.equal((await call("/api/operations/site-plans/"+plan.id+"/analyze",{version:plan.version})).status,403);assert.equal(visionCalls,before);
});
test("Tenant isolation and logo validation protect stored imagery and exports",async()=>{
 assert.equal((await call("/api/operations/branding",{name:"Tenant",logo:"data:image/svg+xml;base64,PHN2Zz4="},admin,"PATCH")).status,400);
 process.env.LAUNCHWORKS_TENANT_ID="different-installation";
 assert.equal((await call("/api/operations/site-plans")).data.length,0);
 assert.equal((await call("/api/operations/site-plans/"+plan.id+"/image")).status,404);
 process.env.LAUNCHWORKS_TENANT_ID="site-tests";
 assert.equal((await call("/api/operations/site-plans/"+plan.id,undefined,editor,"DELETE")).status,403);
 assert.equal((await call("/api/operations/site-plans/"+plan.id,undefined,root,"DELETE")).status,200);
 assert.equal((await call("/api/operations/site-plans/"+plan.id+"/image")).status,404);
});
