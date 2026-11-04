import {useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {Link,useLocation} from "wouter";
import {queryClient} from "@/lib/queryClient";
import {Button} from "@/components/ui/button";
import {Textarea} from "@/components/ui/textarea";
export async function request(path:string,body?:unknown,method=body===undefined?"GET":"POST"){
 const res=await fetch(path,{method,credentials:"include",headers:body===undefined?{}:{"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)});
 if(!res.ok){const data=await res.json().catch(()=>({}));throw new Error(data.message||"Request failed. Please try again.");}
 return res.status===204?null:res.json();
}
type Message={role:"user"|"assistant";content:string};
type Pending={id:string;action:Record<string,any>};
const usd=(c:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(c/100);
function PreparedChange({action,context}:{action:Record<string,any>;context:any}){
 const names:Record<string,string>={"proposal.create":"Create a private draft estimate","proposal.update":"Update a draft estimate","measurement.create":"Calculate a supplied boundary","rates.set":"Update approved service pricing","service.create":"Add a service","service.update":"Update a service","service.delete":"Remove a service","config.set":"Update the consultation message"};
 const d=action.data||{},service=(id:number)=>context?.services?.find((s:any)=>s.id===id)?.title||"Selected service";
 return <div className="space-y-2"><h3 className="font-semibold">{names[action.type]||"Review requested change"}</h3>{d.title&&<p className="text-sm">{d.title}</p>}{d.scope&&<p className="text-sm whitespace-pre-wrap">{d.scope}</p>}{d.lines?.map((l:any,i:number)=><p className="text-sm" key={i}>{service(l.serviceId)} · {l.quantity} {context?.rates?.find((r:any)=>r.serviceId===l.serviceId)?.unit||"units"}{l.measurementId?" · verified field measurement":""}</p>)}{d.lines&&<p className="text-xs text-zinc-400">Creates or updates a private draft. Review the calculated total before issuing it to a customer.</p>}{d.source&&<p className="text-sm">Source: {d.source} · {d.points?.length||0} boundary points. Field verification remains a separate step.</p>}{action.rates?.map((r:any)=><p className="text-sm" key={r.serviceId}>{service(r.serviceId)}: {usd(r.unitPriceCents)} / {r.unit} · Minimum {usd(r.minimumCents)}</p>)}{action.type==="service.delete"&&<p className="text-sm">Remove {service(action.id)} from the service catalog. Existing issued proposals retain their frozen scope.</p>}{d.description&&<p className="text-sm whitespace-pre-wrap">{d.description}</p>}{d.isActive!==undefined&&<p className="text-sm">Service visibility: {d.isActive?"Active":"Inactive"}</p>}{action.type==="config.set"&&<p className="text-sm whitespace-pre-wrap">{action.value}</p>}</div>;
}
export function AgentConversation({staff=false,canManage=true}:{staff?:boolean;canManage?:boolean}){
 const context=useQuery<any>({queryKey:["/api/operations/context"],enabled:staff,staleTime:0});
 const [messages,setMessages]=useState<Message[]>([]),[draft,setDraft]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const [pending,setPending]=useState<Pending[]>([]),[done,setDone]=useState<string[]>([]);
 async function send(e:React.FormEvent){
  e.preventDefault();if(!draft.trim()||busy)return;
  const next:Message[]=[...messages,{role:"user",content:draft.trim()}];setMessages(next);setDraft("");setError("");setBusy(true);
  try{const data=await request(staff?"/api/operations/agent":"/api/sales-agent",{messages:next.slice(-12)});setMessages([...next,{role:"assistant",content:data.reply}]);setPending(data.pending||[]);}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function confirm(p:Pending){
  if(!window.confirm("Apply this reviewed change to Reign Services?"))return;
  setBusy(true);setError("");
  try{await request("/api/operations/agent/actions/"+p.id+"/confirm",{});setDone(d=>[...d,p.id]);await queryClient.invalidateQueries();}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <section aria-label={staff?"Staff assistant":"Reign project advisor"} className="space-y-3">
 <p className="text-sm text-zinc-300">{staff?(canManage?"Ask about your CRM, projects, and services, or prepare a pricing, CMS, measurement, or draft-proposal change. Review each proposed action before applying it.":"Ask about contacts, follow-ups, deals, or project tasks, and prepare draft proposals or measurements. An administrator approves pricing and issues customer bids."):"Tell us about your project. We’ll help you explore our services and request a free consultation."}</p>
 <div aria-live="polite" className="space-y-3 max-h-[55dvh] overflow-y-auto">
 {messages.map((m,i)=><p key={i} className={m.role==="user"?"bg-white/10 rounded p-3 text-sm whitespace-pre-wrap":"bg-violet-950/30 rounded p-3 text-sm whitespace-pre-wrap"}><strong>{m.role==="user"?"You":"Reign"}: </strong>{m.content}</p>)}
 {pending.map(p=><div key={p.id} className="p-4 border border-violet-300 rounded-lg"><PreparedChange action={p.action} context={context.data}/><Button className="mt-4" disabled={busy||done.includes(p.id)} onClick={()=>confirm(p)}>{done.includes(p.id)?"Applied":"Confirm change"}</Button></div>)}
 </div>{error&&<p role="alert" className="text-red-500 text-sm">{error}</p>}
 <form onSubmit={send} className="space-y-2"><label className="sr-only" htmlFor={staff?"staff-message":"sales-message"}>Your message</label><Textarea id={staff?"staff-message":"sales-message"} value={draft} onChange={e=>setDraft(e.target.value)} maxLength={3000} placeholder={staff?"What would you like help with?":"What do you have in mind?"} required/><Button type="submit" disabled={busy||!draft.trim()}>{busy?"Working…":"Send message"}</Button></form>
 {!staff&&<Link href="/contact" className="block text-center bg-violet-700 hover:bg-violet-600 rounded p-3 font-semibold">Request a free consultation</Link>}
 </section>;
}
export default function SalesAgent(){
 const [open,setOpen]=useState(false),[location]=useLocation();if(location.startsWith("/admin")||location.startsWith("/portal")||location==="/login")return null;
 return <aside className="fixed bottom-4 right-4 z-50 max-w-[calc(100vw-2rem)]">{open&&<div className="mb-3 p-5 w-[360px] max-w-[calc(100vw-2rem)] bg-[#141416] border border-white/20 rounded-xl shadow-xl max-h-[80dvh] overflow-y-auto"><div className="flex justify-between gap-4 mb-4"><h2 className="font-semibold">Plan your project</h2><button aria-label="Close project advisor" onClick={()=>setOpen(false)}>✕</button></div><AgentConversation/></div>}<Button onClick={()=>setOpen(!open)} aria-expanded={open} className="bg-violet-700 hover:bg-violet-600 text-white">Ask Reign</Button></aside>;
}
