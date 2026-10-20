import {z} from "zod";
// Accept a single JSON object or a fenced JSON response; never execute model text.
export function parseModelJson(raw:string):any {
  return JSON.parse(raw.trim().replace(/^\x60\x60\x60(?:json)?\s*/i,"").replace(/\s*\x60\x60\x60$/,""));
}

const generatedResearch=z.object({
 marketInsights:z.string().trim().min(1).max(10000),
 topics:z.array(z.object({
  title:z.string().trim().min(1).max(200),overview:z.string().max(5000),
  targetKeywords:z.array(z.string().min(1).max(200)).min(1).max(20),
  searchIntent:z.enum(["informational","commercial","transactional"]),
  estimatedSearchVolume:z.enum(["high","medium","low"]),
  competitionLevel:z.enum(["high","medium","low"]),
  leadPotential:z.string().max(3000),reasoning:z.string().max(5000),
 })).min(1).max(5),
});
export const parseResearch=(raw:string)=>generatedResearch.parse(parseModelJson(raw));
