/**
 * ai.ts — multi-provider AI client
 * Supports: anthropic | openai | openrouter | ollama | none
 *
 * All calls go through callAI(prompt, systemPrompt?).
 * Settings are read fresh from DB each call so the user can change provider without restart.
 */

import { getSettings } from "./db.js";

export type AIProvider = "anthropic" | "openai" | "openrouter" | "ollama" | "none";

export class AIError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AIError";
  }
}

export interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  model: string;
  baseUrl: string;
}

export function getAIConfig(): AIConfig {
  const s = getSettings();
  return {
    provider: (s.aiProvider || "none") as AIProvider,
    apiKey: s.aiApiKey || "",
    model: s.aiModel || "",
    baseUrl: s.aiBaseUrl || "",
  };
}

const PROVIDER_DEFAULTS: Record<AIProvider, { model: string; baseUrl: string }> = {
  anthropic: { model: "claude-3-5-haiku-20241022", baseUrl: "https://api.anthropic.com" },
  openai: { model: "gpt-4o-mini", baseUrl: "https://api.openai.com" },
  openrouter: { model: "anthropic/claude-3-haiku", baseUrl: "https://openrouter.ai/api" },
  ollama: { model: "llama3.2", baseUrl: "http://localhost:11434" },
  none: { model: "", baseUrl: "" },
};

export async function callAI(
  prompt: string,
  systemPrompt = "You are a helpful assistant for a personal task and project management system.",
  maxTokens = 512,
): Promise<string> {
  const cfg = getAIConfig();
  if (cfg.provider === "none") throw new AIError("NOT_CONFIGURED", "No AI provider configured");

  const model = cfg.model || PROVIDER_DEFAULTS[cfg.provider].model;
  const baseUrl = cfg.baseUrl || PROVIDER_DEFAULTS[cfg.provider].baseUrl;

  switch (cfg.provider) {
    case "anthropic":
      return callAnthropic(cfg.apiKey, model, baseUrl, systemPrompt, prompt, maxTokens);
    case "openai":
    case "openrouter":
      return callOpenAICompat(cfg.apiKey, model, baseUrl, systemPrompt, prompt, maxTokens, cfg.provider);
    case "ollama":
      return callOllama(model, baseUrl, systemPrompt, prompt, maxTokens);
    default:
      throw new AIError("UNKNOWN_PROVIDER", `Unknown provider: ${cfg.provider}`);
  }
}

async function callAnthropic(
  apiKey: string, model: string, baseUrl: string,
  system: string, user: string, maxTokens: number,
): Promise<string> {
  if (!apiKey) throw new AIError("NO_API_KEY", "Anthropic API key not configured");
  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new AIError("API_ERROR", `Anthropic error ${res.status}: ${err}`);
  }
  const data = await res.json() as any;
  return data.content?.[0]?.text ?? "";
}

async function callOpenAICompat(
  apiKey: string, model: string, baseUrl: string,
  system: string, user: string, maxTokens: number,
  provider: string,
): Promise<string> {
  if (!apiKey) throw new AIError("NO_API_KEY", `${provider} API key not configured`);
  const url = provider === "openrouter" ? `${baseUrl}/v1/chat/completions` : `${baseUrl}/v1/chat/completions`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${apiKey}`,
  };
  if (provider === "openrouter") {
    headers["HTTP-Referer"] = "http://localhost:8787";
    headers["X-Title"] = "NEONDECK";
  }
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new AIError("API_ERROR", `${provider} error ${res.status}: ${err}`);
  }
  const data = await res.json() as any;
  return data.choices?.[0]?.message?.content ?? "";
}

async function callOllama(
  model: string, baseUrl: string,
  system: string, user: string, maxTokens: number,
): Promise<string> {
  const res = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      options: { num_predict: maxTokens },
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new AIError("API_ERROR", `Ollama error ${res.status}: ${err}`);
  }
  const data = await res.json() as any;
  return data.message?.content ?? "";
}

/** Classify a raw capture string into task|idea|project|note */
export async function classifyCapture(text: string): Promise<{
  type: "task" | "idea" | "project" | "note";
  title: string;
  area?: string;
  confidence: number;
}> {
  const prompt = `Classify this input into ONE of: task, idea, project, note.

Rules:
- task: something to DO (action items, errands, concrete next steps)
- idea: a creative thought, inspiration, or something to explore later
- project: a larger initiative with multiple steps
- note: a reminder, reference info, or observation

Input: "${text}"

Respond with ONLY valid JSON like:
{"type":"task","title":"Buy dog food","area":"errands","confidence":0.95}

"area" for tasks only: work, personal, home, coding, business, errands, health, finance
"title" should be clean and concise.`;

  try {
    const raw = await callAI(prompt, "You are a classification assistant. Respond only with valid JSON.", 150);
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON in response");
    return JSON.parse(match[0]);
  } catch {
    // fallback: treat as task
    return { type: "task", title: text.trim(), confidence: 0 };
  }
}

/** Generate a dashboard summary of a given type */
export async function generateSummary(type: string, context: object): Promise<string> {
  const prompts: Record<string, string> = {
    today_focus: `Based on this data, write a 2-3 sentence "Today's Focus" summary highlighting what the user should prioritize today. Be direct and actionable.`,
    whats_blocked: `Based on this data, write a brief summary of what's blocked and what might unblock it. 2-3 sentences max.`,
    week_progress: `Based on this data, write a 2-3 sentence "This Week's Progress" summary. Be positive but honest.`,
    ideas_revisit: `Based on this data, identify 1-2 ideas worth revisiting and briefly explain why. 2-3 sentences.`,
    agent_suggest: `Based on this task/project data, suggest 2-3 specific next actions the user should take. Be concrete and brief.`,
  };

  const systemPrompt = prompts[type] || prompts.today_focus;
  const contextStr = JSON.stringify(context, null, 2).slice(0, 3000);

  return callAI(
    `Context data:\n${contextStr}`,
    `You are a personal productivity assistant for someone with ADHD. ${systemPrompt} Keep responses short, punchy, and actionable. No fluff.`,
    300,
  );
}
