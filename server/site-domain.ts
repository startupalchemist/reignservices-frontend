import {z} from "zod";
import {measurePolygon} from "./operations-domain";
export const brandingModes=["platform","dual","tenant"] as const;
export type BrandingMode=typeof brandingModes[number];
export const subscriptionSchema=z.object({
 tier:z.enum(["starter","pro","white_label"]),status:z.enum(["active","trialing","past_due","canceled","paused","incomplete"]),
 currentPeriodEnd:z.string().datetime().nullable(),
}).strict().superRefine((s,c)=>{if(s.tier!=="starter"&&!s.currentPeriodEnd)c.addIssue({code:"custom",message:"Premium entitlements require an expiry date"});});
export function entitlements(s:{tier:string;status:string;currentPeriodEnd?:string|null},now=Date.now()){
 const active=["starter","pro","white_label"].includes(s.tier)&&["active","trialing"].includes(s.status)&&(!s.currentPeriodEnd||Date.parse(s.currentPeriodEnd)>now)
   &&(s.tier==="starter"||!!s.currentPeriodEnd);
 const modes:BrandingMode[]=!active?[]:s.tier==="white_label"?["platform","dual","tenant"]:s.tier==="pro"?["platform","dual"]:["platform"];
 return {active,modes,aiMarkup:active,canExport:active,whiteLabel:modes.includes("tenant")};
}
export const shapeSchema=z.object({
 label:z.string().trim().min(1).max(65),kind:z.enum(["turf","hardscape","roof","pool","landscape","other"]),
 confidence:z.enum(["high","medium","low"]),notes:z.string().max(500).default(""),
 points:z.array(z.tuple([z.number().min(0).max(1),z.number().min(0).max(1)])).min(3).max(60),
}).strict();
export const annotationsSchema=z.object({summary:z.string().max(1500),shapes:z.array(shapeSchema).max(8)}).strict();
export function measuredShapes(raw:unknown,feetPerPixel:number){
 const input=raw as any;
 const value=annotationsSchema.parse(input&&typeof input==="object"?{...input,shapes:Array.isArray(input.shapes)?input.shapes.map((s:any)=>{if(!s||typeof s!=="object")return s;const {areaSqFt,perimeterFt,...shape}=s;return shape;}):input.shapes}:input);
 return {...value,shapes:value.shapes.map(s=>({...s,...measurePolygon(s.points.map(([x,y])=>[x*768*feetPerPixel,y*768*feetPerPixel]))}))};
}
export function mapScale(latitude:number,zoom:number){
 // Static styles use the Mapbox GL 512-pixel world convention, at 1x, north-up.
 const metersPerPixel=40075016.68557849*Math.cos(latitude*Math.PI/180)/(512*2**zoom);
 return {metersPerPixel,feetPerPixel:metersPerPixel/0.3048};
}
export function mercatorBounds(lat:number,lng:number,zoom:number){
 const x=6378137*lng*Math.PI/180,y=6378137*Math.log(Math.tan(Math.PI/4+lat*Math.PI/360));
 const half=40075016.68557849/(512*2**zoom)*768/2;
 return [x-half,y-half,x+half,y+half];
}
export const pngLogo=z.string().max(90000).refine(v=>{
 if(!/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(v))return false;
 const b=Buffer.from(v.split(",")[1],"base64");
 return b.length>=24&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
   &&b.readUInt32BE(16)>0&&b.readUInt32BE(20)>0&&b.readUInt32BE(16)<=1024&&b.readUInt32BE(20)<=1024;
},"Upload a PNG logo under 65 KB and 1024 pixels.");
export const tenantBrandSchema=z.object({name:z.string().trim().min(1).max(65),logo:pngLogo.nullable()}).strict();
export const colors={turf:"#22c55e",hardscape:"#f59e0b",roof:"#60a5fa",pool:"#22d3ee",landscape:"#a3e635",other:"#c084fc"};
export const xml=(s:unknown)=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c]!));
export function renderSitePlan(plan:any,brand:{name:string;logo:string|null},platformLogo:string|null,mode:BrandingMode){
 const d=plan.document,ann=measuredShapes(d.annotations,d.feetPerPixel);
 const showPlatform=mode!=="tenant",showTenant=mode!=="platform";
 const x=44,y=180,size=992;
 const polygons=ann.shapes.map((s,i)=>{
  const points=s.points.map(([a,b])=>[x+a*size,y+b*size].join(",")).join(" ");
  const center=s.points.reduce((v,[a,b])=>[v[0]+a/s.points.length,v[1]+b/s.points.length],[0,0]);
  return '<polygon points="'+points+'" fill="'+colors[s.kind]+'" fill-opacity=".18" stroke="'+colors[s.kind]+'" stroke-width="3"/><circle cx="'+(x+center[0]*size)+'" cy="'+(y+center[1]*size)+'" r="17" fill="#0b1220" stroke="'+colors[s.kind]+'" stroke-width="2"/><text x="'+(x+center[0]*size)+'" y="'+(y+center[1]*size+5)+'" text-anchor="middle" fill="white" font-size="16">'+(i+1)+'</text>';
 }).join("");
 // Leave the provider's bottom attribution strip completely unobscured.
 const overlays='<defs><clipPath id="markup"><rect x="'+x+'" y="'+y+'" width="'+size+'" height="'+(d.provider==="mapbox"?size-55:size)+'"/></clipPath></defs><g clip-path="url(#markup)">'+polygons+'</g>';
 const legend=ann.shapes.map((s,i)=>'<rect x="44" y="'+(1232+i*32)+'" width="8" height="18" rx="3" fill="'+colors[s.kind]+'"/><text x="65" y="'+(1247+i*32)+'" font-size="15" fill="#dce5ee">'+xml((i+1)+". "+s.label+" · "+s.areaSqFt.toLocaleString("en-US")+" sq ft · "+s.perimeterFt.toLocaleString("en-US")+" linear ft · "+s.confidence+" confidence")+'</text>').join("");
 const bottom=1260+ann.shapes.length*32,height=bottom+135;
 const platform=showPlatform?(platformLogo?'<image href="'+platformLogo+'" x="44" y="28" width="235" height="66" preserveAspectRatio="xMinYMid meet"/>':'<text x="44" y="63" font-size="32" font-weight="700" fill="#f4ce83">LaunchWorks</text><text x="45" y="85" font-size="12" fill="#b8c4d6">BY OCOTILLO INTELLIGENCE</text>'):"";
 const tenant=showTenant?(brand.logo?'<image href="'+brand.logo+'" x="766" y="22" width="270" height="80" preserveAspectRatio="xMaxYMid meet"/>':'<text x="1036" y="64" text-anchor="end" font-size="25" fill="#f8fafc">'+xml(brand.name)+'</text>'):"";
 return '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="'+height+'" viewBox="0 0 1080 '+height+'"><rect width="1080" height="'+height+'" fill="#0b1220"/><g font-family="DejaVu Sans,Arial,sans-serif">'+platform+tenant+'<text x="44" y="130" fill="#f8fafc" font-size="25" font-weight="700">AERIAL SITE STUDY</text><text x="44" y="156" fill="#aebbd0" font-size="14">'+xml(d.address)+'</text><image href="'+plan.image_data+'" x="'+x+'" y="'+y+'" width="'+size+'" height="'+size+'"/>'+overlays+'<rect x="986" y="200" width="32" height="52" rx="4" fill="#0b1220"/><text x="1002" y="220" text-anchor="middle" font-size="15" fill="white">N</text><path d="M1002 228 L996 244 L1008 244 Z" fill="white"/><text x="44" y="1197" font-size="11" fill="#aebbd0">'+xml(d.attribution)+'</text><text x="44" y="1215" font-size="11" fill="#aebbd0">North up · Retrieved '+xml(d.retrievedAt.slice(0,10))+' · Approximate scale '+d.feetPerPixel.toFixed(3)+' ft / source pixel</text>'+legend+'<path d="M44 '+bottom+' H1036" stroke="#293447"/><text x="44" y="'+(bottom+27)+'" fill="#f4ce83" font-size="14">'+(plan.reviewed_at?"STAFF REVIEWED ESTIMATE":"PRELIMINARY · STAFF REVIEW REQUIRED")+'</text><text x="44" y="'+(bottom+51)+'" fill="#aebbd0" font-size="12">Visual estimates only. Not a boundary survey. Verify property, dimensions and site conditions before bidding.</text><text x="44" y="'+(bottom+72)+'" fill="#aebbd0" font-size="12">Imagery dates vary. Regions may overlap; do not sum their areas. Confirm all project dimensions on site.</text>'+(showPlatform?'<text x="44" y="'+(bottom+105)+'" fill="#77869d" font-size="11">Engineered by TachyonXLabs</text>':"")+'</g></svg>';
}
