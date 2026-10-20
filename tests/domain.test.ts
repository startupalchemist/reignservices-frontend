import { test } from "node:test";
import assert from "node:assert/strict";
import {requireEmailAccepted} from "../server/mail-result";
import {measurePolygon,calculateProposal,proposalInput,measurementInput} from "../server/operations-domain";
const rates=[{serviceId:1,unit:"sq ft" as const,unitPriceCents:825,minimumCents:15000}];
const services=[{id:1,title:"Turf",isActive:true}];
test("Measurements calculate concave polygons, winding-independent area and perimeter",()=>{
  const points:[number,number][]=[[0,0],[30,0],[30,20],[10,20],[10,10],[0,10]];
  assert.equal(measurePolygon(points).areaSqFt,500);
  assert.equal(measurePolygon([...points].reverse()).areaSqFt,500);
  assert.equal(measurePolygon([[0,0],[30,0],[30,20],[0,20]]).perimeterFt,100);
});
test("Measurements reject intersecting, zero-area and malformed boundaries",()=>{
  assert.throws(()=>measurePolygon([[0,0],[10,10],[0,10],[10,0]]));
  assert.throws(()=>measurePolygon([[0,0],[10,0],[20,0]]));
  assert.throws(()=>measurementInput.parse({leadId:1,label:"x",source:"x",points:[[0,0],[Infinity,0],[1,1]]}));
});
test("Bid pricing preserves cents, minimum charges and deterministic tax",()=>{
  const input=proposalInput.parse({leadId:1,title:"Test",scope:"Scope",lines:[{serviceId:1,quantity:2}],taxBasisPoints:825});
  const result=calculateProposal(input,rates,services);
  assert.equal(result.subtotalCents,15000);assert.equal(result.taxCents,1238);assert.equal(result.totalCents,16238);
  rates[0].unitPriceCents=900;assert.equal(result.lines[0].unitPriceCents,825);rates[0].unitPriceCents=825;
});
test("Bids reject missing rates, inactive services, negative quantities and injected money",()=>{
  const input=proposalInput.parse({leadId:1,title:"Test",scope:"Scope",lines:[{serviceId:1,quantity:100}]});
  assert.throws(()=>calculateProposal(input,[],services));
  assert.throws(()=>calculateProposal(input,rates,[{...services[0],isActive:false}]));
  assert.throws(()=>proposalInput.parse({...input,lines:[{serviceId:1,quantity:-1}]}));
  assert.throws(()=>proposalInput.parse({...input,totalCents:1}));
});

test("Email acceptance rejects provider errors and missing message IDs",()=>{
 assert.throws(()=>requireEmailAccepted({data:null,error:{message:"Rejected"}}));
 assert.throws(()=>requireEmailAccepted({data:null,error:null}));
 assert.equal(requireEmailAccepted({data:{id:"test-message"},error:null}),"test-message");
});
