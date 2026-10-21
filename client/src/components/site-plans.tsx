import {useState,useEffect} from "react";
import {useQuery} from "@tanstack/react-query";
import {queryClient} from "@/lib/queryClient";
import {useAuth} from "@/lib/auth";
import {request} from "./reign-agent";
import {Button} from "./ui/button";
import {Input} from "./ui/input";
const colors:any={turf:"#22c55e",hardscape:"#f59e0b",roof:"#60a5fa",pool:"#22d3ee",landscape:"#a3e635",other:"#c084fc"};
const select="w-full rounded bg-zinc-900 border border-white/20 p-2 text-white";
export default function SitePlans({leadId}:{leadId:string}){
 const {user}=useAuth();
 const {data:branding,refetch:refreshBrand}=useQuery<any>({queryKey:["/api/operations/branding"],staleTime:0,refetchInterval:30000,refetchOnWindowFocus:true});
 const {data:plans=[],refetch}=useQuery<any[]>({queryKey:["/api/operations/site-plans"]});
 const [current,setCurrent]=useState<any>(null),[address,setAddress]=useState(""),[lat,setLat]=useState(""),[lng,setLng]=useState(""),[zoom,setZoom]=useState("19");
 const [mode,setMode]=useState("platform"),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [points,setPoints]=useState<number[][]>([]),[label,setLabel]=useState("Project area"),[kind,setKind]=useState("turf");
 const [brandName,setBrandName]=useState(""),[logo,setLogo]=useState<string|null>(null),[platformLogo,setPlatformLogo]=useState<string|null>(null);
 const [tier,setTier]=useState("starter"),[status,setStatus]=useState("active"),[end,setEnd]=useState("");
 useEffect(()=>{setCurrent(null);setPoints([]);},[leadId]);
 useEffect(()=>{if(branding){setBrandName(branding.brand.name);setLogo(branding.brand.logo);setPlatformLogo(branding.platformLogo);setTier(branding.subscription.tier);setStatus(branding.subscription.status);setEnd(branding.subscription.currentPeriodEnd?.slice(0,10)||"");if(!branding.entitlements.modes.includes(mode))setMode(branding.entitlements.modes[0]||"platform");}},[branding]);
 async function run(work:()=>Promise<unknown>,message:string){setBusy(true);setError("");setNotice("");try{await work();await Promise.all([refetch(),refreshBrand(),queryClient.invalidateQueries({queryKey:["/api/operations/measurements"]})]);setNotice(message);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const update=async(url:string,body:any,method="POST")=>{const p=await request(url,body,method);setCurrent(p);return p;};
 const endpoint=current?"/api/operations/site-plans/"+current.id:"";
 async function upload(file:File|undefined,set:(value:string|null)=>void){
  if(!file)return;try{
   if(file.type!=="image/png")throw new Error("Choose a PNG logo.");
   const url=URL.createObjectURL(file);const image=new Image();image.src=url;
   try{await image.decode();const canvas=document.createElement("canvas"),ratio=Math.min(1,320/image.width,220/image.height);canvas.width=Math.max(1,Math.round(image.width*ratio));canvas.height=Math.max(1,Math.round(image.height*ratio));canvas.getContext("2d")!.drawImage(image,0,0,canvas.width,canvas.height);const data=canvas.toDataURL("image/png");if(data.length>90000)throw new Error("Logo is too detailed. Upload a smaller PNG.");set(data);}finally{URL.revokeObjectURL(url);}
  }catch(e){setError((e as Error).message);}
 }
 async function download(format:string){
  const r=await fetch(endpoint+"/export?"+new URLSearchParams({mode,format}),{credentials:"same-origin"});
  if(!r.ok)throw new Error((await r.json()).message||"Export failed");
  const url=URL.createObjectURL(await r.blob()),a=document.createElement("a");a.href=url;a.download="site-plan-"+current.id+"-"+mode+"."+format;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
 }
 return <section className="rounded border border-white/15 p-5 space-y-5" aria-label="Aerial site plans">
  <header><h3 className="text-xl font-semibold">Aerial site plans</h3><p className="text-sm text-zinc-400 mt-2">Locate a property, review AI outlines, and export a branded site study. Aerial measurements are estimates; confirm the map center and verify dimensions on site.</p></header>
  {error&&<p role="alert" className="text-red-300">{error}</p>}{notice&&<p role="status" className="text-green-300">{notice}</p>}
  <div className="grid md:grid-cols-2 gap-5">
   <form className="space-y-3" onSubmit={e=>{e.preventDefault();run(async()=>{const p=await request("/api/operations/site-plans",{leadId:Number(leadId),address,zoom:Number(zoom),...(lat&&lng?{lat:Number(lat),lng:Number(lng)}:{})});setCurrent(p);setPoints([]);},"Aerial image loaded. Confirm that the intended project is in view.");}}>
    <label className="block" htmlFor="site-address">Property address</label><Input id="site-address" required minLength={6} maxLength={200} value={address} onChange={e=>setAddress(e.target.value)}/>
    <p className="text-xs text-zinc-400">Address matching may place the pin on the street. Enter a confirmed center below when needed.</p>
    <div className="grid grid-cols-2 gap-3"><div><label htmlFor="site-lat">Latitude (optional)</label><Input id="site-lat" type="number" step="any" min="24" max="50" value={lat} onChange={e=>setLat(e.target.value)}/></div><div><label htmlFor="site-lng">Longitude (optional)</label><Input id="site-lng" type="number" step="any" min="-125" max="-66" value={lng} onChange={e=>setLng(e.target.value)}/></div></div>
    <label htmlFor="site-zoom" className="block">View</label><select id="site-zoom" className={select} value={zoom} onChange={e=>setZoom(e.target.value)}>{[17,18,19,20].map(n=><option key={n} value={n}>Zoom {n}</option>)}</select>
    <Button disabled={busy||!leadId||!branding?.entitlements.active||!!lat!==!!lng}>Load aerial image</Button>{!leadId&&<p className="text-xs text-amber-200">Choose a customer lead above first.</p>}
   </form>
   <div className="space-y-3">
    <label htmlFor="site-saved" className="block">Saved site plans</label><select id="site-saved" className={select} value={current?.id||""} onChange={e=>{setCurrent(plans.find(p=>p.id===Number(e.target.value))||null);setPoints([]);}}><option value="">Choose a site plan</option>{plans.filter(p=>!leadId||p.lead_id===Number(leadId)).map(p=><option key={p.id} value={p.id}>#{p.id} · {p.document.address}</option>)}</select>
    <p className="text-sm text-zinc-400">Export plan: {branding?.subscription.tier?.replace("_"," ")} · {branding?.subscription.status}</p>
    <label htmlFor="site-brand-mode" className="block">Export branding</label><select id="site-brand-mode" className={select} value={mode} onChange={e=>setMode(e.target.value)}>
     <option value="platform" disabled={!branding?.entitlements.modes.includes("platform")}>LaunchWorks logo</option><option value="dual" disabled={!branding?.entitlements.modes.includes("dual")}>LaunchWorks + tenant logo · Pro</option><option value="tenant" disabled={!branding?.entitlements.modes.includes("tenant")}>Tenant logo only · White Label</option>
    </select><p className="text-xs text-zinc-400">Provider attribution stays on every export. Only the platform owner can change subscription access.</p>
    <div className="flex flex-wrap gap-3"><Button disabled={busy||!current||!branding?.entitlements.canExport} onClick={()=>run(()=>download("png"),"PNG exported.")}>Download branded PNG</Button><Button variant="outline" disabled={busy||!current||!branding?.entitlements.canExport} onClick={()=>run(()=>download("svg"),"SVG exported.")}>Download SVG</Button></div>
   </div>
  </div>
  {current&&<div className="space-y-4">
   <p className="text-sm text-zinc-400 break-words">{current.document.address} · {current.document.provider} · {current.reviewed_at?"Staff reviewed estimate":"Needs staff review"}</p>
   <div className="flex flex-wrap gap-3"><Button disabled={busy||!branding?.entitlements.aiMarkup} onClick={()=>run(()=>update(endpoint+"/analyze",{version:current.version}),"AI outlines ready for review. Adjust or remove any uncertain areas.")}>{busy?"Working…":"AI markup visible areas"}</Button><Button variant="outline" disabled={busy||!current.document.annotations.shapes.length} onClick={()=>{if(window.confirm("I checked the map center and all outlines against the visible project. These remain estimates until site verification."))run(()=>update(endpoint+"/review",{version:current.version}),"Site study reviewed. Field verification is still required before using measurements in a bid.");}}>Mark plan reviewed</Button></div>
   <svg viewBox="0 0 768 768" className="w-full max-w-3xl rounded border border-white/20 cursor-crosshair touch-manipulation" role="img" aria-label="Aerial image with project boundaries; click to draw an estimated boundary" onClick={e=>{if(busy)return;const r=e.currentTarget.getBoundingClientRect();setPoints(p=>p.length>=60?p:[...p,[Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))]]);}}>
    <image href={endpoint+"/image"} width="768" height="768"/>
    {current.document.annotations.shapes.map((s:any,i:number)=><g key={i}><polygon points={s.points.map(([x,y]:number[])=>[x*768,y*768].join(",")).join(" ")} fill={colors[s.kind]} fillOpacity=".18" stroke={colors[s.kind]} strokeWidth="3"/><text x={s.points[0][0]*768+4} y={s.points[0][1]*768+18} fill="white" stroke="#111" strokeWidth=".5" fontSize="17">{i+1}</text></g>)}
    {points.length>0&&<><polyline points={points.map(([x,y])=>[x*768,y*768].join(",")).join(" ")} fill="none" stroke="#f4ce83" strokeWidth="3"/>{points.map(([x,y],i)=><circle key={i} cx={x*768} cy={y*768} r="4" fill="#f4ce83"/>)}</>}
   </svg>
   <p className="text-xs text-zinc-400">{current.document.attribution}. Imagery acquisition dates vary. Outlines show visible surfaces, not legal parcel boundaries.</p>
   <p className="text-sm">{current.document.annotations.summary}</p>
   <Button variant="outline" disabled={busy} onClick={()=>{if(window.confirm("Delete this site plan and its saved aerial image? Existing proposal measurements remain available."))run(async()=>{await request(endpoint,undefined,"DELETE");setCurrent(null);setPoints([]);},"Site plan deleted.");}}>Delete site plan</Button>
   <div className="grid sm:grid-cols-2 gap-3"><div><label htmlFor="site-shape-label">Boundary label</label><Input id="site-shape-label" maxLength={65} value={label} onChange={e=>setLabel(e.target.value)}/></div><div><label htmlFor="site-shape-kind">Surface</label><select id="site-shape-kind" value={kind} className={select} onChange={e=>setKind(e.target.value)}>{Object.keys(colors).map(k=><option key={k}>{k}</option>)}</select></div></div>
   <p className="text-xs text-zinc-400">Click the image to place boundary corners ({points.length}/60). Add at least three points, then save. Changes require a fresh staff review.</p>
   <div className="flex flex-wrap gap-3"><Button disabled={busy||points.length<3||current.document.annotations.shapes.length>=8} onClick={()=>run(async()=>{await update(endpoint,{version:current.version,annotations:{...current.document.annotations,shapes:[...current.document.annotations.shapes.map(({areaSqFt,perimeterFt,...s}:any)=>s),{label,kind,points,confidence:"medium",notes:"Staff-drawn aerial estimate"}]}},"PATCH");setPoints([]);},"Boundary saved.")}>Save drawn boundary</Button><Button variant="outline" disabled={!points.length} onClick={()=>setPoints(p=>p.slice(0,-1))}>Undo point</Button><Button variant="outline" onClick={()=>setPoints([])}>Clear drawing</Button></div>
   <ul className="space-y-3">{current.document.annotations.shapes.map((s:any,i:number)=><li key={i} className="border-t border-white/10 pt-3 space-y-2"><p>{i+1}. {s.label} · {s.areaSqFt} sq ft · {s.perimeterFt} linear ft · {s.confidence} confidence</p><p className="text-xs text-zinc-400">{s.notes}</p><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy||!current.reviewed_at} onClick={()=>run(()=>request(endpoint+"/measurements",{version:current.version,shapeIndex:i}),"Estimate copied to measurements. Verify on site before approving it for a proposal.")}>Send to measurements</Button><Button variant="outline" disabled={busy} onClick={()=>run(()=>update(endpoint,{version:current.version,annotations:{...current.document.annotations,shapes:current.document.annotations.shapes.filter((_:any,n:number)=>n!==i).map(({areaSqFt,perimeterFt,...s}:any)=>s)}},"PATCH"),"Boundary removed; review the remaining outlines.")}>Remove boundary</Button></div></li>)}</ul>
  </div>}
  <details className="border-t border-white/10 pt-4"><summary className="cursor-pointer">Tenant logo and branding</summary><div className="space-y-3 mt-4">
   <label htmlFor="tenant-brand-name">Business name</label><Input id="tenant-brand-name" maxLength={65} value={brandName} onChange={e=>setBrandName(e.target.value)}/>
   <label htmlFor="tenant-logo" className="block">Tenant logo (PNG)</label><Input id="tenant-logo" type="file" accept="image/png" onChange={e=>upload(e.target.files?.[0],setLogo)}/>{logo&&<img src={logo} className="h-20 max-w-full object-contain bg-white rounded p-2" alt="Tenant logo preview"/>}
   <div className="flex gap-3"><Button disabled={busy} onClick={()=>run(()=>request("/api/operations/branding",{name:brandName,logo},"PATCH"),"Tenant branding saved.")}>Save tenant branding</Button><Button variant="outline" onClick={()=>setLogo(null)}>Use business name instead</Button></div>
  </div></details>
  {user?.role==="root"&&<details className="border-t border-white/10 pt-4"><summary className="cursor-pointer">Platform owner · subscription and logo controls</summary><div className="space-y-3 mt-4">
   <p className="text-sm text-zinc-400">Owner-managed entitlements. Premium access requires an expiry date. These controls grant app access; they do not charge or refund a subscription.</p>
   <label htmlFor="site-tier" className="block">Tier</label><select id="site-tier" className={select} value={tier} onChange={e=>setTier(e.target.value)}>{["starter","pro","white_label"].map(t=><option key={t}>{t}</option>)}</select>
   <label htmlFor="site-sub-status" className="block">Status</label><select id="site-sub-status" className={select} value={status} onChange={e=>setStatus(e.target.value)}>{["active","trialing","past_due","canceled","paused","incomplete"].map(t=><option key={t}>{t}</option>)}</select>
   <label htmlFor="site-period-end" className="block">Access ends (UTC)</label><Input id="site-period-end" type="date" value={end} onChange={e=>setEnd(e.target.value)}/>
   <Button disabled={busy} onClick={()=>{if(window.confirm("Apply these subscription access settings?"))run(()=>request("/api/operations/branding/subscription",{tier,status,currentPeriodEnd:end?new Date(end+"T23:59:59Z").toISOString():null},"PATCH"),"Subscription access updated.");}}>Apply entitlement</Button>
   <label htmlFor="platform-logo" className="block">LaunchWorks logo (PNG; wordmark used when empty)</label><Input id="platform-logo" type="file" accept="image/png" onChange={e=>upload(e.target.files?.[0],setPlatformLogo)}/>{platformLogo&&<img src={platformLogo} alt="Platform logo preview" className="h-20 object-contain bg-white rounded p-2"/>}
   <Button disabled={busy} onClick={()=>run(()=>request("/api/operations/branding/platform-logo",{logo:platformLogo},"PATCH"),"Platform logo saved.")}>Save platform logo</Button>
  </div></details>}
 </section>;
}
