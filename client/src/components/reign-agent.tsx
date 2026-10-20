import { useState } from "react";
import { Link, useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
export async function request(path:string,body?:unknown,method=body===undefined?"GET":"POST") {
  const res=await fetch(path,{method,credentials:"include",headers:body===undefined?{}:{"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)});
  if(!res.ok) {const data=await res.json().catch(()=>({}));throw new Error(data.message||"Request failed. Please try again.");}
  return res.status===204?null:res.json();
}
type Message={role:"user"|"assistant";content:string};
type Pending={id:string;action:Record<string,unknown>};
export function AgentConversation({staff=false}:{staff?:boolean}) {
  const [messages,setMessages]=useState<Message[]>([]),[draft,setDraft]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [pending,setPending]=useState<Pending[]>([]),[done,setDone]=useState<string[]>([]);
  async function send(e:React.FormEvent) {
    e.preventDefault();if(!draft.trim()||busy) return;
    const next:Message[]=[...messages,{role:"user",content:draft.trim()}];
    setMessages(next);setDraft("");setError("");setBusy(true);
    try {
      const data=await request(staff?"/api/operations/agent":"/api/sales-agent",{messages:next.slice(-12)});
      setMessages([...next,{role:"assistant",content:data.reply}]);setPending(data.pending||[]);
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function confirm(p:Pending) {
    if(!window.confirm("Apply this reviewed change to Reign Services?")) return;
    setBusy(true);setError("");
    try{await request("/api/operations/agent/actions/"+p.id+"/confirm",{});setDone(d=>[...d,p.id]);await queryClient.invalidateQueries();}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <section aria-label={staff?"Staff assistant":"Reign project advisor"} className="space-y-3">
    <p className="text-sm text-zinc-300">{staff?"Ask about your services or request a CMS, pricing, configuration, or proposal change. Review each proposed action before applying it.":"Tell us about your project. We’ll help you explore our services and request a free consultation."}</p>
    <div aria-live="polite" className="space-y-3 max-h-72 overflow-y-auto">
      {messages.map((m,i)=><p key={i} className={m.role==="user"?"bg-white/10 rounded p-3 text-sm whitespace-pre-wrap":"bg-violet-950/30 rounded p-3 text-sm whitespace-pre-wrap"}><strong>{m.role==="user"?"You":"Reign"}: </strong>{m.content}</p>)}
      {pending.map(p=><div key={p.id} className="p-3 border border-violet-400 rounded"><p>Proposed change — {String(p.action.type)}</p><pre className="whitespace-pre-wrap break-all text-xs my-3">{JSON.stringify(p.action,null,2)}</pre><Button disabled={busy||done.includes(p.id)} onClick={()=>confirm(p)}>{done.includes(p.id)?"Applied":"Confirm change"}</Button></div>)}
    </div>
    {error&&<p role="alert" className="text-red-300">{error}</p>}
    <form onSubmit={send} className="space-y-2">
      <label className="sr-only" htmlFor={staff?"staff-message":"sales-message"}>Your message</label>
      <Textarea id={staff?"staff-message":"sales-message"} value={draft} onChange={e=>setDraft(e.target.value)} maxLength={3000} placeholder={staff?"What would you like to change?":"What do you have in mind?"} required />
      <Button type="submit" disabled={busy||!draft.trim()}>{busy?"Working…":"Send message"}</Button>
    </form>
    {!staff&&<Link href="/contact" className="block text-center bg-violet-700 hover:bg-violet-600 rounded p-3 font-semibold">Request a free consultation</Link>}
  </section>;
}
export default function SalesAgent() {
  const [open,setOpen]=useState(false),[location]=useLocation();
  if(location.startsWith("/admin")||location.startsWith("/portal")||location==="/login") return null;
  return <aside className="fixed bottom-4 right-4 z-50 max-w-[calc(100vw-2rem)]">
    {open&&<div className="mb-3 p-5 w-[360px] max-w-[calc(100vw-2rem)] bg-[#141416] border border-white/20 rounded-xl shadow-xl max-h-[80dvh] overflow-y-auto">
      <div className="flex justify-between gap-4 mb-4"><h2 className="font-semibold">Plan your project</h2><button aria-label="Close project advisor" onClick={()=>setOpen(false)}>✕</button></div>
      <AgentConversation />
    </div>}
    <Button onClick={()=>setOpen(!open)} aria-expanded={open} className="bg-violet-700 hover:bg-violet-600 text-white">Ask Reign</Button>
  </aside>;
}
