import { z } from "zod";

export const rateSchema = z.object({
  serviceId: z.number().int().positive(),
  unit: z.enum(["sq ft", "linear ft", "job", "each"]),
  unitPriceCents: z.number().int().min(1).max(100000000),
  minimumCents: z.number().int().min(0).max(100000000),
}).strict();
export type Rate = z.infer<typeof rateSchema>;
export const proposalInput = z.object({
  leadId: z.number().int().positive(),
  title: z.string().trim().min(1).max(200),
  scope: z.string().trim().min(1).max(8000),
  lines: z.array(z.object({
    serviceId: z.number().int().positive(),
    quantity: z.number().finite().positive().max(1000000),
    measurementId: z.number().int().positive().optional(),
  }).strict()).min(1).max(30),
  taxBasisPoints: z.number().int().min(0).max(3000).default(0),
}).strict();

export function calculateProposal(input: z.infer<typeof proposalInput>, rates: Rate[], services: {id: number; title: string; isActive: boolean}[]) {
  const lines = input.lines.map(line => {
    const service = services.find(s => s.id === line.serviceId && s.isActive);
    const rate = rates.find(r => r.serviceId === line.serviceId);
    if (!service || !rate) throw new Error("Every line needs an active service and an approved rate card");
    const totalCents = Math.max(rate.minimumCents, Math.round(line.quantity * rate.unitPriceCents));
    return {...line, title: service.title, unit: rate.unit, unitPriceCents: rate.unitPriceCents, totalCents};
  });
  const subtotalCents = lines.reduce((sum, line) => sum + line.totalCents, 0);
  const taxCents = Math.round(subtotalCents * input.taxBasisPoints / 10000);
  if (!Number.isSafeInteger(subtotalCents + taxCents) || subtotalCents + taxCents > 1000000000) throw new Error("Proposal exceeds allowed total");
  return {...input, lines, subtotalCents, taxCents, totalCents: subtotalCents + taxCents, currency: "USD"};
}
export const measurementInput = z.object({
  leadId: z.number().int().positive(),
  label: z.string().trim().min(1).max(200),
  // Coordinates in feet from a site survey or scaled drawing, never inferred by an LLM.
  points: z.array(z.tuple([z.number().finite().min(-100000).max(100000), z.number().finite().min(-100000).max(100000)])).min(3).max(100),
  source: z.string().trim().min(1).max(500),
}).strict();
type Point = [number, number];
function orient(a: Point, b: Point, c: Point) {return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);}
export function measurePolygon(points: Point[]) {
  const n = points.length;
  const on = (a: Point,b: Point,c: Point) => Math.min(a[0],b[0])<=c[0] && c[0]<=Math.max(a[0],b[0]) && Math.min(a[1],b[1])<=c[1] && c[1]<=Math.max(a[1],b[1]);
  for(let i=0;i<n;i++) {
    const a=points[i], b=points[(i+1)%n];
    if(a[0]===b[0] && a[1]===b[1]) throw new Error("Duplicate boundary point");
    for(let j=i+1;j<n;j++) {
      if(j===i+1 || (i===0 && j===n-1)) continue;
      const c=points[j], d=points[(j+1)%n];
      const o1=orient(a,b,c),o2=orient(a,b,d),o3=orient(c,d,a),o4=orient(c,d,b);
      if((o1*o2<0 && o3*o4<0) || (!o1&&on(a,b,c)) || (!o2&&on(a,b,d)) || (!o3&&on(c,d,a)) || (!o4&&on(c,d,b))) throw new Error("Boundary must not intersect itself");
    }
  }
  let twiceArea=0, perimeter=0;
  for(let i=0;i<n;i++) {
    const a=points[i],b=points[(i+1)%n];
    twiceArea+=a[0]*b[1]-b[0]*a[1]; perimeter+=Math.hypot(b[0]-a[0],b[1]-a[1]);
  }
  const area=Math.abs(twiceArea)/2;
  if(area<0.01) throw new Error("Boundary has no measurable area");
  return {areaSqFt: Math.round(area*100)/100, perimeterFt: Math.round(perimeter*100)/100};
}
