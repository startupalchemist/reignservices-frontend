import OpenAI from "openai";
import {isFreeModel,runFreeRequest} from "./free-routing";
import { reserveInference } from "./reign-context";

export function freeModel() {
  const model = process.env.OPENROUTER_MODEL || "openrouter/free";
  if (!isFreeModel(model)) throw new Error("Only free inference models are allowed");
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
  client.chat.completions.create=(async (...args: any[]) =>
    runFreeRequest(args[0],args[1],create as any,reserveInference,freeModel())
  ) as typeof client.chat.completions.create;
  }
  return client;
}
export const publicBaseUrl = () => (process.env.PUBLIC_BASE_URL || "https://getreignservices.com").replace(/\/$/, "");
