import { useEffect, useState } from "react";
import { request } from "@/components/reign-agent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
const money=(c:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(c/100);
export default function CustomerPortal() {
  const [data,setData]=useState<any>(null),[error,setError]=useState(""),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[name,setName]=useState("");
  async function load(){setData(await request("/api/portal/me"));}
  useEffect(()=>{
    document.title="Your project | Reign Services";
    const token=window.location.hash.slice(1);
    if(token) window.history.replaceState(null,"","/portal");
    (async()=>{try{if(token) await request("/api/portal/session",{token});await load();}catch(e){setError((e as Error).message);}finally{setLoading(false);}})();
  },[]);
  async function decide(p:any,decision:string) {
    if(!window.confirm(decision==="accepted"?"Accept this proposal and scope?":"Decline this proposal?")) return;
    setBusy(true);setError("");
    try{await request("/api/portal/proposals/"+p.id+"/decision",{version:p.version,decision,name});await load();}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <div className="bg-[#0B0B0D] min-h-screen pt-32 pb-20 px-6 text-white"><div className="max-w-4xl mx-auto space-y-6">
    <h1 className="text-3xl font-semibold">Your Reign project</h1>
    {loading&&<p role="status">Opening your project…</p>}
    {error&&<p role="alert" className="text-red-300">{error}</p>}
    {!loading&&!data&&<p>Use the private project link provided by your Reign team. If it expired, please request a new link.</p>}
    {data&&<>
      <div className="flex flex-wrap justify-between gap-4"><div><h2 className="text-xl">Welcome, {data.customer.name}</h2><p>{data.customer.project} · {data.customer.status}</p></div>
      <Button onClick={async()=>{await request("/api/portal/logout",{});setData(null);}}>Sign out</Button></div>
      {data.proposals.length===0&&<p>Your team is preparing your proposal. It will appear here when ready.</p>}
      {data.proposals.map((p:any)=><article key={p.id} className="rounded-lg border border-white/20 p-6 space-y-4">
        <div><p className="text-sm text-violet-300 uppercase">{p.status} · Proposal #{p.id}</p><h2 className="text-2xl font-semibold">{p.document.title}</h2></div>
        <p className="whitespace-pre-wrap">{p.document.scope}</p>
        <div className="overflow-auto"><table className="w-full text-left"><thead><tr><th>Service</th><th>Quantity</th><th>Unit price</th><th>Total</th></tr></thead>
          <tbody>{p.document.lines.map((l:any,i:number)=><tr key={i} className="border-t border-white/10"><td className="py-3 pr-3">{l.title}</td><td className="pr-3">{l.quantity} {l.unit}</td><td className="pr-3">{money(l.unitPriceCents)}</td><td>{money(l.totalCents)}</td></tr>)}</tbody></table></div>
        <p>Subtotal: {money(p.document.subtotalCents)} · Tax: {money(p.document.taxCents)}</p><p className="text-xl font-semibold">Total: {money(p.document.totalCents)}</p>
        {p.status==="issued"&&<div className="space-y-3"><label htmlFor={"signer-"+p.id}>Your full name to record your decision</label><Input id={"signer-"+p.id} value={name} onChange={e=>setName(e.target.value)} maxLength={200} autoComplete="name"/><div className="flex gap-3"><Button disabled={busy||name.trim().length<2} onClick={()=>decide(p,"accepted")}>Accept proposal</Button><Button variant="outline" disabled={busy||name.trim().length<2} onClick={()=>decide(p,"declined")}>Decline proposal</Button></div><p className="text-xs text-zinc-400">Acceptance records your agreement to the scope and total shown. Your team will contact you to confirm scheduling and payment arrangements.</p></div>}
      </article>)}
      <a href="/contact" className="underline">Contact your Reign team</a>
    </>}
  </div></div>;
}
