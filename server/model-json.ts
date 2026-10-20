// Accept a single JSON object or a fenced JSON response; never execute model text.
export function parseModelJson(raw:string):any {
  return JSON.parse(raw.trim().replace(/^\x60\x60\x60(?:json)?\s*/i,"").replace(/\s*\x60\x60\x60$/,""));
}
