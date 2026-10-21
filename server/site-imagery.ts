import sharp from "sharp";
import {mapScale,mercatorBounds} from "./site-domain";
export async function locateAddress(address:string){
 const url=new URL("https://geocoding.geo.census.gov/geocoder/locations/onelineaddress");
 url.search=new URLSearchParams({address,benchmark:"Public_AR_Current",format:"json"}).toString();
 const r=await fetch(url,{signal:AbortSignal.timeout(20000),redirect:"error"});
 if(!r.ok)throw Object.assign(new Error("Address lookup is temporarily unavailable"),{status:503});
 const j=await r.json(),match=j.result?.addressMatches?.[0];
 if(!match)throw Object.assign(new Error("Address not found. Supply a full US address, or enter a confirmed map center."),{status:400});
 return {lat:Number(match.coordinates.y),lng:Number(match.coordinates.x),address:String(match.matchedAddress)};
}
export async function fetchImagery(lat:number,lng:number,zoom:number){
 const key=process.env.MAPBOX_TOKEN;
 const provider=key?"mapbox":"usgs-naip-plus";
 let url:URL;
 if(key){
  url=new URL("https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/"+lng+","+lat+","+zoom+",0,0/768x768");
  url.search=new URLSearchParams({access_token:key,logo:"true",attribution:"true"}).toString();
 }else{
  url=new URL("https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer/exportImage");
  url.search=new URLSearchParams({bbox:mercatorBounds(lat,lng,zoom).join(","),bboxSR:"3857",imageSR:"3857",size:"768,768",format:"jpg",f:"image",bandIds:"0,1,2",interpolation:"RSP_BilinearInterpolation"}).toString();
 }
 const r=await fetch(url,{signal:AbortSignal.timeout(30000),redirect:"error"});
 if(!r.ok||!r.headers.get("content-type")?.startsWith("image/"))throw Object.assign(new Error("Aerial imagery is unavailable for this location. Try another map center or zoom."),{status:503});
 if(Number(r.headers.get("content-length"))>5000000)throw new Error("Imagery response too large");
 const reader=r.body!.getReader();let n=0;const chunks:Uint8Array[]=[];
 while(true){const {done,value}=await reader.read();if(done)break;n+=value.length;if(n>5000000){await reader.cancel();throw new Error("Imagery response too large");}chunks.push(value);}
 const image=sharp(Buffer.concat(chunks),{limitInputPixels:2000000,failOn:"warning"});
 const meta=await image.metadata();if(meta.width!==768||meta.height!==768)throw new Error("Unexpected imagery dimensions");
 const buffer=await image.jpeg({quality:90}).toBuffer();
 return {imageData:"data:image/jpeg;base64,"+buffer.toString("base64"),provider,
  attribution:provider==="mapbox"?"Mapbox satellite · Provider attribution retained in image":"USGS, USDA, The National Map: Orthoimagery (NAIP Plus)",
  ...mapScale(lat,zoom),retrievedAt:new Date().toISOString()};
}
