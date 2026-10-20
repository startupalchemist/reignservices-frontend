import OpenAI from "openai";
import { reserveInference } from "./reign-context";

export function freeModel() {
  const model = process.env.OPENROUTER_MODEL || "openrouter/free";
  if (model !== "openrouter/free" && !model.endsWith(":free")) throw new Error("Only free inference models are allowed");
  return model;
}
let client: OpenAI | undefined;
export function getInference() {
  if (!process.env.OPENROUTER_API_KEY) throw Object.assign(new Error("Staff AI is awaiting OpenRouter configuration"),{status:503});
  freeModel();
  if (!client) {
  client = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
    timeout: 45000, maxRetries: 0,
    defaultHeaders: { "HTTP-Referer": process.env.PUBLIC_BASE_URL || "https://getreignservices.com", "X-Title": "Reign Services" },
  });
  const create=client.chat.completions.create.bind(client.chat.completions);
  client.chat.completions.create=(async (...args: any[]) => {
    if(args[0]?.model!==freeModel()) throw new Error("Only the configured free model is allowed");
    await reserveInference();
    return (create as any)(...args);
  }) as typeof client.chat.completions.create;
  }
  return client;
}
export const publicBaseUrl = () => (process.env.PUBLIC_BASE_URL || "https://getreignservices.com").replace(/\/$/, "");
