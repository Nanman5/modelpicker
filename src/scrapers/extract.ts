import { z } from "zod";
import { fetch as undiciFetch } from "undici";

const DEFAULT_BASE_URL = "https://integrate.api.nvidia.com/v1";
const DEFAULT_MODEL = "meta/llama-3.3-70b-instruct";

export interface ExtractOptions {
  /** Optional override; defaults to env NVIDIA_EXTRACTION_MODEL or DEFAULT_MODEL. */
  model?: string;
  /** Optional override; defaults to env NVIDIA_BASE_URL or DEFAULT_BASE_URL. */
  baseUrl?: string;
  /** Optional override; defaults to env NVIDIA_API_KEY. */
  apiKey?: string;
  /** Tokens to allow in the response. Default 8000. */
  maxTokens?: number;
  /** Sampling temperature. Default 0.0 (deterministic). */
  temperature?: number;
}

export interface LLMClient {
  extract<T>(args: {
    system: string;
    user: string;
    schema: z.ZodType<T>;
    schemaName: string;
  }): Promise<T>;
}

/**
 * NVIDIA Build API client — OpenAI-compatible chat completions endpoint with
 * JSON output forced. We don't rely on full JSON-schema mode (provider-specific);
 * we ask for JSON, parse it, and validate with Zod.
 */
export function createLLMClient(opts: ExtractOptions = {}): LLMClient {
  const apiKey = opts.apiKey ?? process.env.NVIDIA_API_KEY;
  const baseUrl = opts.baseUrl ?? process.env.NVIDIA_BASE_URL ?? DEFAULT_BASE_URL;
  const model = opts.model ?? process.env.NVIDIA_EXTRACTION_MODEL ?? DEFAULT_MODEL;
  const maxTokens = opts.maxTokens ?? 8000;
  const temperature = opts.temperature ?? 0.0;

  if (!apiKey) {
    throw new Error(
      "NVIDIA_API_KEY is not set. Copy .env.example to .env and provide a key from https://build.nvidia.com",
    );
  }

  return {
    async extract<T>({
      system,
      user,
      schema,
      schemaName,
    }: {
      system: string;
      user: string;
      schema: z.ZodType<T>;
      schemaName: string;
    }): Promise<T> {
      const body = JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              system +
              "\n\nReply with a SINGLE JSON object that strictly matches the requested shape. " +
              "Do not include prose, code fences, or commentary. " +
              `The top-level key must be "${schemaName}".`,
          },
          { role: "user", content: user },
        ],
      });

      const res = await undiciFetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
          accept: "application/json",
        },
        body,
      });

      const text = await res.text();
      if (!res.ok) {
        throw new Error(`LLM API ${res.status}: ${text.slice(0, 500)}`);
      }

      const completion = JSON.parse(text) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = completion.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("LLM API returned empty completion");
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(stripFences(content));
      } catch (err) {
        throw new Error(
          `LLM output was not valid JSON: ${(err as Error).message}\n--- raw ---\n${content.slice(0, 1000)}`,
        );
      }

      const wrapped =
        typeof parsed === "object" && parsed !== null && schemaName in (parsed as object)
          ? (parsed as Record<string, unknown>)[schemaName]
          : parsed;

      const result = schema.safeParse(wrapped);
      if (!result.success) {
        throw new Error(
          `LLM output failed schema validation:\n${result.error.toString()}\n--- payload ---\n${JSON.stringify(
            wrapped,
          ).slice(0, 1000)}`,
        );
      }
      return result.data;
    },
  };
}

function stripFences(s: string): string {
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/m;
  const m = s.trim().match(fence);
  return m && m[1] ? m[1] : s;
}
