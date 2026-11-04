import crypto from "node:crypto";
import { storage } from "./storage";
import { pool } from "./db";
import { rateSchema } from "./operations-domain";
import { z } from "zod";

// Read through on every request: CMS mutations are immediately reflected, including deletes.
// The version fingerprints relationships as well as the service facts.
export async function contextGraph(staff = false) {
  const all = await storage.getServices();
  const services = all.filter(s => staff || s.isActive).map(s => ({
    id:s.id, title:s.title, description:s.description, header:s.header,
    keyDetails:s.keyDetails, slug:s.slug, isActive:s.isActive,
    ...(staff || s.showPrice ? {price:s.price} : {}),
  }));
  const rates = staff ? z.array(rateSchema).parse(JSON.parse(await storage.getSetting("reign_rate_card") || "[]")) : [];
  const consultation = {
    url:"/contact",
    message: await storage.getSetting("reign_consultation_message") || "Request a free consultation. Our team will contact you to confirm availability.",
  };
  const nodes = [
    {id:"reign",type:"business",name:"Reign Services",region:"Dallas-Fort Worth"},
    ...services.map(s=>({...s,id:`service:${s.id}`,serviceId:s.id,type:"service"})),
    {id:"consultation",type:"conversion",...consultation},
    ...rates.map(r=>({...r,id:`rate:${r.serviceId}`,type:"rate"})),
  ];
  const edges = services.flatMap(s=>[
    {from:"reign",to:`service:${s.id}`,type:"offers"},
    {from:`service:${s.id}`,to:"consultation",type:"next_step"},
    ...(rates.some(r=>r.serviceId===s.id) ? [{from:`service:${s.id}`,to:`rate:${s.id}`,type:"priced_by"}] : []),
  ]);
  const version=crypto.createHash("sha256").update(JSON.stringify({nodes,edges})).digest("hex");
  return {version,nodes,edges,services,rates,consultation};
}
export async function reserveInference() {
  const limit=Math.max(1,Math.min(1000,Number(process.env.AI_DAILY_REQUEST_LIMIT)||40));
  const result=await pool.query(`INSERT INTO reign_ai_budget(day, requests) VALUES (CURRENT_DATE,1)
    ON CONFLICT(day) DO UPDATE SET requests=reign_ai_budget.requests+1 WHERE reign_ai_budget.requests<$1 RETURNING requests`,[limit]);
  if(!result.rowCount) throw Object.assign(new Error("Daily free inference budget reached"),{status:429});
}
