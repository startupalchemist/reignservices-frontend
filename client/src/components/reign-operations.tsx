import SitePlans from "./site-plans";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { AgentConversation, request } from "./reign-agent";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
const money=(c:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(c/100);
export default function ReignOperations() {
  const {data:context}=useQuery<any>({queryKey:["/api/operations/context"],staleTime:0,refetchInterval:30000,refetchOnWindowFocus:true});
  const {data:leads=[]}=useQuery<any[]>({queryKey:["/api/leads"]});
  const {data:proposals=[]}=useQuery<any[]>({queryKey:["/api/operations/proposals"]});
  const {data:measurements=[]}=useQuery<any[]>({queryKey:["/api/operations/measurements"]});
  const [leadId,setLeadId]=useState(""),[serviceId,setServiceId]=useState(""),[quantity,setQuantity]=useState(""),[scope,setScope]=useState(""),[title,setTitle]=useState(""),[tax,setTax]=useState("0");
  const [rate,setRate]=useState(""),[minimum,setMinimum]=useState("0"),[unit,setUnit]=useState("sq ft");
  const [length,setLength]=useState(""),[width,setWidth]=useState(""),[boundary,setBoundary]=useState(""),[source,setSource]=useState(""),[measurementId,setMeasurementId]=useState("");
  const [notice,setNotice]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false),[portal,setPortal]=useState("");
  async function run(fn:()=>Promise<unknown>,message:string) {
    setBusy(true);setError("");setNotice("");
    try{await fn();await queryClient.invalidateQueries();setNotice(message);}catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  const action=(body:unknown)=>request("/api/operations/actions",body);
  const selectClass="w-full bg-zinc-900 border border-white/20 rounded p-2 text-white";
  return <div className="space-y-8 text-white">
    <header><h2 className="text-2xl font-semibold">Reign Operations</h2><p className="text-zinc-400 mt-2">Manage pricing, measurements, proposals, and private customer access.</p></header>
    {error&&<p role="alert" className="text-red-300">{error}</p>}{notice&&<p role="status" className="text-green-300">{notice}</p>}
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="rounded border border-white/15 p-5"><h3 className="text-lg mb-4">Staff assistant</h3><AgentConversation staff /></div>
      <section className="rounded border border-white/15 p-5 space-y-3">
        <h3 className="text-lg">Project and service</h3>
        <label htmlFor="ops-customer" className="block">Customer lead</label><select id="ops-customer" className={selectClass} value={leadId} onChange={e=>{setLeadId(e.target.value);setMeasurementId("");setPortal("");}}><option value="">Choose a customer</option>{leads.map(l=><option key={l.id} value={l.id}>#{l.id} · {l.name} · {l.vehicle}</option>)}</select>
        <label htmlFor="ops-service" className="block">Service</label><select id="ops-service" className={selectClass} value={serviceId} onChange={e=>{setServiceId(e.target.value);setMeasurementId("");const r=context?.rates.find((r:any)=>r.serviceId===Number(e.target.value));setRate(r?String(r.unitPriceCents/100):"");setMinimum(r?String(r.minimumCents/100):"0");setUnit(r?.unit||"sq ft");}}><option value="">Choose a service</option>{context?.services.filter((s:any)=>s.isActive).map((s:any)=><option key={s.id} value={s.id}>#{s.id} · {s.title}</option>)}</select>
        <p className="text-xs text-zinc-400 break-all">The assistant uses the latest services and approved rates.</p>
        {leadId&&<><Button disabled={busy} onClick={()=>run(async()=>{const r=await request("/api/operations/portal-access",{leadId:Number(leadId)});setPortal(r.url);},"Private link created. Any earlier link for this customer is revoked.")}>Create customer portal link</Button>
          {portal&&<div className="space-y-2"><label htmlFor="portal-link">Private link — share only with this customer</label><Input id="portal-link" value={portal} readOnly onFocus={e=>e.target.select()}/><a href={portal} target="_blank" rel="noreferrer" className="underline">Preview customer portal</a></div>}
          <Button variant="outline" disabled={busy} onClick={()=>{if(window.confirm("Revoke this customer's portal access?"))run(()=>request("/api/operations/portal-access/"+leadId,undefined,"DELETE"),"Portal access revoked.");}}>Revoke portal access</Button></>}
      </section>
      <form className="rounded border border-white/15 p-5 space-y-3" onSubmit={e=>{e.preventDefault();run(()=>action({type:"rates.set",rates:[...(context?.rates||[]).filter((r:any)=>r.serviceId!==Number(serviceId)),{serviceId:Number(serviceId),unit,unitPriceCents:Math.round(Number(rate)*100),minimumCents:Math.round(Number(minimum)*100)}]}),"Rate card saved.");}}>
        <h3 className="text-lg">Approved service pricing</h3><p className="text-sm text-zinc-400">Choose a service above and set its approved rate. Updated rates apply to new proposals; existing proposals retain their reviewed prices.</p>
        <label htmlFor="rate-unit" className="block">Pricing unit</label><select id="rate-unit" value={unit} onChange={e=>setUnit(e.target.value)} className={selectClass}>{["sq ft","linear ft","job","each"].map(u=><option key={u}>{u}</option>)}</select>
        <label htmlFor="unit-price" className="block">Unit price ($)</label><Input id="unit-price" type="number" min="0.01" step="0.01" required value={rate} onChange={e=>setRate(e.target.value)}/>
        <label htmlFor="minimum-price" className="block">Minimum line charge ($)</label><Input id="minimum-price" type="number" min="0" step="0.01" required value={minimum} onChange={e=>setMinimum(e.target.value)}/>
        <Button disabled={busy||!serviceId}>Save approved rate</Button>
        <ul className="text-sm space-y-2">{context?.rates.map((r:any)=><li key={r.serviceId}>{context.services.find((s:any)=>s.id===r.serviceId)?.title||"Archived service"}: {money(r.unitPriceCents)} / {r.unit} · Minimum {money(r.minimumCents)}</li>)}</ul>
      </form>
      <form className="rounded border border-white/15 p-5 space-y-3" onSubmit={e=>{e.preventDefault();run(()=>{
        const points=boundary.trim()?JSON.parse(boundary):[[0,0],[Number(length),0],[Number(length),Number(width)],[0,Number(width)]];
        return request("/api/operations/measurements",{leadId:Number(leadId),label:"Project boundary",points,source});
      },"Measurement calculated. Verify the source and boundary before using it in a bid.");}}>
        <h3 className="text-lg">Property boundary measurement</h3><p className="text-sm text-zinc-400">Calculate area and perimeter from a survey or scaled drawing. Use Aerial site plans below for imagery-based estimates. Verify site conditions before quoting.</p>
        <label htmlFor="length" className="block">Rectangle length (feet)</label><Input id="length" type="number" min="0.01" step="any" value={length} onChange={e=>setLength(e.target.value)}/>
        <label htmlFor="width" className="block">Rectangle width (feet)</label><Input id="width" type="number" min="0.01" step="any" value={width} onChange={e=>setWidth(e.target.value)}/>
        <label htmlFor="boundary" className="block">Or polygon coordinates in feet</label><Textarea id="boundary" placeholder="[[0,0],[30,0],[30,20],[0,20]]" value={boundary} onChange={e=>setBoundary(e.target.value)}/>
        <label htmlFor="measurement-source" className="block">Measurement source</label><Input id="measurement-source" placeholder="Site survey or scaled drawing reference" required value={source} onChange={e=>setSource(e.target.value)}/>
        <Button disabled={busy||!leadId||(!boundary&&(!length||!width))}>Calculate and save</Button>
      </form>
    </div>
    <SitePlans leadId={leadId}/>
    <section className="rounded border border-white/15 p-5 space-y-3"><h3 className="text-lg">Saved measurements</h3>
      {measurements.filter(m=>!leadId||m.lead_id===Number(leadId)).map(m=><div key={m.id} className="flex flex-wrap gap-3 justify-between border-b border-white/10 py-3"><p>#{m.id} · Lead #{m.lead_id} · {m.area_sq_ft} sq ft · {m.perimeter_ft} linear ft · {m.source} · {m.verified?"Verified":"Needs review"}</p>{!m.verified&&<Button disabled={busy} onClick={()=>{if(window.confirm("I have checked this boundary and source and verified it for estimating.")) run(()=>request("/api/operations/measurements/"+m.id+"/verify",{}),"Measurement verified.");}}>Verify measurement</Button>}</div>)}
      {!measurements.length&&<p className="text-zinc-400">No measurements yet.</p>}
    </section>
    <form className="rounded border border-white/15 p-5 space-y-3" onSubmit={e=>{e.preventDefault();run(()=>action({type:"proposal.create",data:{leadId:Number(leadId),title,scope,lines:[{serviceId:Number(serviceId),quantity:Number(quantity),...(measurementId?{measurementId:Number(measurementId)}:{})}],taxBasisPoints:Math.round(Number(tax)*100)}}),"Draft proposal created. Review before issuing.");}}>
      <h3 className="text-lg">Generate proposal / bid</h3><p className="text-sm text-zinc-400">Select the customer and service above. The staff assistant can prepare multi-service proposals and update drafts.</p>
      <label htmlFor="proposal-title" className="block">Proposal title</label><Input id="proposal-title" required value={title} onChange={e=>setTitle(e.target.value)} maxLength={200}/>
      <label htmlFor="proposal-scope" className="block">Scope of work and terms</label><Textarea id="proposal-scope" required value={scope} onChange={e=>setScope(e.target.value)} maxLength={8000}/>
      <label htmlFor="proposal-measurement" className="block">Use verified measurement (optional)</label><select id="proposal-measurement" className={selectClass} value={measurementId} onChange={e=>{
        setMeasurementId(e.target.value);const m=measurements.find(m=>m.id===Number(e.target.value)),r=context?.rates.find((r:any)=>r.serviceId===Number(serviceId));
        if(m&&r) setQuantity(r.unit==="sq ft"?m.area_sq_ft:r.unit==="linear ft"?m.perimeter_ft:"1");
      }}><option value="">Enter quantity manually</option>{measurements.filter(m=>m.lead_id===Number(leadId)&&m.verified).map(m=><option key={m.id} value={m.id}>#{m.id} · {m.area_sq_ft} sq ft · {m.perimeter_ft} linear ft</option>)}</select>
      <label htmlFor="proposal-quantity" className="block">Quantity</label><Input id="proposal-quantity" type="number" min="0.01" step="any" required value={quantity} onChange={e=>{setQuantity(e.target.value);setMeasurementId("");}}/>
      <label htmlFor="proposal-tax" className="block">Applicable tax (%) — confirm for this job</label><Input id="proposal-tax" type="number" min="0" max="30" step="0.01" required value={tax} onChange={e=>setTax(e.target.value)}/>
      <Button disabled={busy||!leadId||!serviceId}>Generate draft proposal</Button>
    </form>
    <section className="space-y-4"><h3 className="text-xl">Proposals</h3>{proposals.map(p=><article key={p.id} className="rounded border border-white/15 p-5 space-y-3">
      <h4 className="font-semibold">#{p.id} · {p.document.title} · Lead #{p.lead_id}</h4><p className="whitespace-pre-wrap">{p.document.scope}</p>
      {p.document.lines.map((l:any,i:number)=><p key={i}>{l.title} · {l.quantity} {l.unit} × {money(l.unitPriceCents)} = {money(l.totalCents)}</p>)}
      <p>{p.status} · Total {money(p.document.totalCents)} · Version {p.version}</p>
      {p.status==="draft"&&<Button disabled={busy} onClick={()=>{if(window.confirm("Issue this reviewed proposal to the customer portal?"))run(()=>request("/api/operations/proposals/"+p.id+"/issue",{version:p.version}),"Proposal issued to the customer portal.");}}>Issue reviewed proposal</Button>}
      {p.status==="issued"&&<Button variant="outline" disabled={busy} onClick={()=>{if(window.confirm("Withdraw this proposal?"))run(()=>request("/api/operations/proposals/"+p.id+"/withdraw",{version:p.version}),"Proposal withdrawn.");}}>Withdraw proposal</Button>}
    </article>)}{!proposals.length&&<p className="text-zinc-400">No proposals yet.</p>}</section>
  </div>;
}
