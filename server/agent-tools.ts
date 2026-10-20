import {actionSchema,fail} from "./reign-operations";
type Schema=Record<string,unknown>;
const string={type:"string"},id={type:"integer",minimum:1};
const object=(properties:Record<string,Schema>,required:string[])=>({type:"object",properties,required,additionalProperties:false});
const service=object({
  title:string,slug:string,description:string,header:string,badge:string,
  keyDetails:{type:"array",items:string},isActive:{type:"boolean"},showPrice:{type:"boolean"},price:{type:["string","null"]},
},[]);
const line=object({serviceId:id,quantity:{type:"number",exclusiveMinimum:0},measurementId:id},["serviceId","quantity"]);
const proposal=object({leadId:id,title:string,scope:string,lines:{type:"array",items:line,minItems:1,maxItems:30},taxBasisPoints:{type:"integer",minimum:0,maximum:3000}},["leadId","title","scope","lines"]);
const rate=object({serviceId:id,unit:{type:"string",enum:["sq ft","linear ft","job","each"]},unitPriceCents:{type:"integer",minimum:1},minimumCents:{type:"integer",minimum:0}},["serviceId","unit","unitPriceCents","minimumCents"]);
const definitions=[
  ["create_service","Prepare a new CMS service for staff confirmation.",{...service,required:["title","slug"]}],
  ["update_service","Prepare changes to an existing CMS service.",object({id,data:service},["id","data"])],
  ["delete_service","Prepare deletion of a CMS service after explicit staff request.",object({id},["id"])],
  ["set_rates","Prepare the complete approved rate card. Preserve unmodified rates.",object({rates:{type:"array",items:rate,maxItems:100}},["rates"])],
  ["set_config","Prepare a change to the free consultation invitation message.",object({key:{type:"string",enum:["reign_consultation_message"]},value:string},["key","value"])],
  ["create_proposal","Prepare a draft bid using real lead IDs, approved rates and supplied quantities.",proposal],
  ["update_proposal","Prepare a version-checked draft bid update.",object({id,version:id,data:proposal},["id","version","data"])],
  ["create_measurement","Calculate a supplied boundary after staff confirms the source; verification remains manual.",object({
    leadId:id,label:string,source:string,points:{type:"array",minItems:3,maxItems:100,items:{type:"array",items:{type:"number"},minItems:2,maxItems:2}},
  },["leadId","label","source","points"])],
] as const;
export const agentTools=definitions.map(([name,description,parameters])=>({
  type:"function" as const,function:{name,description,parameters},
}));
export function actionFromTool(name:string,args:unknown) {
  if(!args || typeof args!=="object" || Array.isArray(args)) fail("Invalid tool arguments",502);
  const a=args as Record<string,unknown>;
  if("type" in a) fail("Unexpected tool argument",502);
  let action:unknown;
  switch(name){
    case "create_service":action={type:"service.create",data:a};break;
    case "update_service":action={...a,type:"service.update"};break;
    case "delete_service":action={...a,type:"service.delete"};break;
    case "set_rates":action={...a,type:"rates.set"};break;
    case "set_config":action={...a,type:"config.set"};break;
    case "create_proposal":action={type:"proposal.create",data:a};break;
    case "update_proposal":action={...a,type:"proposal.update"};break;
    case "create_measurement":action={type:"measurement.create",data:a};break;
    default:fail("Unknown staff tool",502);
  }
  return actionSchema.parse(action);
}
