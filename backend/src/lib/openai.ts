// src/lib/openai.ts
import fetch from "node-fetch";

const OPENAI_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_KEY) {
  console.warn("OPENAI_API_KEY is not set — OpenAI calls will fail without it.");
}

export type OpenAIResult =
  | { ok: true; text: string }
  | { ok: false; error: string; retryAfterSeconds?: number | null; status?: number };

function parseRetryAfter(headers: HeadersLike | null): number | null {
  if (!headers) return null;
  // headers might be a Headers object or a plain record
  try {
    // @ts-ignore
    if (typeof headers.get === "function") {
      const v = headers.get("retry-after") ?? headers.get("Retry-After");
      if (!v) return null;
      const n = Number(v);
      if (!Number.isNaN(n)) return Math.round(n);
      const parsed = parseInt(v, 10);
      return Number.isNaN(parsed) ? null : parsed;
    } else if (typeof headers === "object") {
      // Node fetch may present plain object in some errors
      // @ts-ignore
      const v = headers["retry-after"] ?? headers["Retry-After"] ?? headers["retry-after-ms"];
      if (!v) return null;
      const n = Number(v);
      if (!Number.isNaN(n)) return Math.round(n);
      const parsed = parseInt(String(v), 10);
      return Number.isNaN(parsed) ? null : parsed;
    }
  } catch (e) {
    return null;
  }
  return null;
}

type HeadersLike = {
  get?: (name: string) => string | null;
  [k: string]: any;
};

async function doRequest(
  model: string,
  messages: { role: string; content: string }[],
  temperature: number,
  max_tokens: number
): Promise<{ ok: boolean; status: number; text?: string; bodyText?: string; headers?: HeadersLike }> {
  const url = "https://api.openai.com/v1/chat/completions";
  const body = {
    model,
    messages,
    temperature,
    max_tokens,
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify(body),
    });

    const status = res.status;
    const headers = res.headers as unknown as HeadersLike;

    let bodyText = "";
    try {
      bodyText = await res.text();
    } catch {
      bodyText = "";
    }

    if (!res.ok) {
      return { ok: false, status, bodyText, headers };
    }

    try {
      const json = JSON.parse(bodyText);
      const content = json?.choices?.[0]?.message?.content ?? "";
      return { ok: true, status, text: String(content), headers };
    } catch {
      return { ok: false, status, bodyText, headers };
    }
  } catch (err: any) {
    // network-level error → headers undefined
    return { ok: false, status: 0, bodyText: String(err?.message || err), headers: undefined };
  }
}


/**
 * callOpenAI
 * - prompt: user's prompt string (will be wrapped into chat messages below)
 * - options: tune model, tokens, retries etc.
 */
export async function callOpenAI(
  prompt: string,
  options?: {
    models?: string[]; // order of preference, first is primary
    temperature?: number;
    max_tokens?: number;
    maxAttemptsPerModel?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
  }
): Promise<OpenAIResult> {
  if (!OPENAI_KEY) {
    return { ok: false, error: "OPENAI_API_KEY not configured on server." };
  }

  const models = options?.models ?? ["gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo"];
  const temperature = options?.temperature ?? 0.2;
  const max_tokens = options?.max_tokens ?? 1500;
  const maxAttemptsPerModel = options?.maxAttemptsPerModel ?? 2;
  const initialDelayMs = options?.initialDelayMs ?? 600;
  const maxDelayMs = options?.maxDelayMs ?? 20_000;

  const messages = [
    {
      role: "system",
      content:
        "You are a helpful assistant that converts requirements and documents into structured test scenarios. Return only valid JSON (an array) unless explicitly asked otherwise.",
    },
    { role: "user", content: prompt },
  ];

  // Try each model, and for each model attempt up to maxAttemptsPerModel with exponential backoff
  for (let mIndex = 0; mIndex < models.length; mIndex++) {
    const model = models[mIndex];
    for (let attempt = 0; attempt < maxAttemptsPerModel; attempt++) {
      const attemptNum = attempt + 1;
      const res = await doRequest(model, messages, temperature, max_tokens);

      if (res.ok && typeof res.text === "string") {
        return { ok: true, text: res.text };
      }

      // If non-ok, examine status
      const status = res.status || 0;
      // If 429, attempt to parse retry-after header and return that to caller (optionally wait and retry)
      const retryAfterSeconds = parseRetryAfter(res.headers ?? null);

      if (status === 429) {
        // If a retry-after is present, return it so caller can surface countdown.
        // But before giving up, attempt one local wait (small jitter) if retry-after is short.
        if (retryAfterSeconds && retryAfterSeconds <= 10) {
          const waitMs = (retryAfterSeconds + Math.random() * 2) * 1000;
          await new Promise((r) => setTimeout(r, waitMs));
          // try again (continue loop)
          continue;
        }

        // If retry-after is long (or absent), return rate-limit info so caller can decide
        return { ok: false, error: `Rate limited by OpenAI (HTTP 429)`, retryAfterSeconds: retryAfterSeconds ?? null, status };
      }

      // For 5xx server errors or network issues, backoff and retry
      if (status >= 500 || status === 0) {
        // exponential backoff with jitter
        const delay = Math.min(initialDelayMs * Math.pow(2, attempt), maxDelayMs);
        const jitter = Math.floor(Math.random() * Math.min(1000, Math.round(delay / 2)));
        await new Promise((r) => setTimeout(r, delay + jitter));
        // continue attempts for this model
        continue;
      }

      // for other 4xx errors (bad request, unauthorized, etc.) return immediately with body text
      const bodyText = res.bodyText ?? `OpenAI HTTP ${status}`;
      return { ok: false, error: bodyText, status, retryAfterSeconds: parseRetryAfter(res.headers ?? null) };
    }
    // after exhausting attempts for this model, try next fallback model
  }

  // All models/attempts exhausted
  return { ok: false, error: "Exhausted all models/attempts calling OpenAI" };
}
