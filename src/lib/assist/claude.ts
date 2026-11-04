import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { MeetingOutput, type MeetingOutputT } from "@/lib/assist/schema";
import type { BuiltPrompt } from "@/lib/assist/prompt";

// The only place that talks to the model provider. Transcript text goes
// nowhere else (SPEC 6.4).

export class AssistError extends Error {
  constructor(readonly code: "not_configured" | "refused" | "truncated" | "invalid" | "rate_limited" | "upstream") {
    super(code);
    this.name = "AssistError";
  }
}

export type GenerateOptions = { model: string; effort: "low" | "medium" | "high" | "xhigh" | "max"; maxTokens: number; timeoutMs: number };

export type GenerateResult = { output: MeetingOutputT; model: string };

/** Signature the summarizer depends on, so tests can supply a fake. */
export type Generate = (prompt: BuiltPrompt, opts: GenerateOptions) => Promise<GenerateResult>;

let client: Anthropic | undefined;

function anthropic(timeoutMs: number): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new AssistError("not_configured");
  client ??= new Anthropic({ maxRetries: 2 });
  return client.withOptions({ timeout: timeoutMs });
}

export const generateWithClaude: Generate = async (prompt, opts) => {
  let response;
  try {
    response = await anthropic(opts.timeoutMs).beta.messages.parse({
      model: opts.model,
      max_tokens: opts.maxTokens,
      thinking: { type: "adaptive" },
      output_config: { effort: opts.effort, format: betaZodOutputFormat(MeetingOutput) },
      // On a safety decline, the API retries on Anthropic's recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: prompt.system,
      messages: [{ role: "user", content: prompt.user }],
    });
  } catch (err) {
    if (err instanceof AssistError) throw err;
    if (err instanceof Anthropic.RateLimitError) throw new AssistError("rate_limited");
    if (err instanceof Anthropic.AuthenticationError) throw new AssistError("not_configured");
    if (err instanceof Anthropic.APIError) throw new AssistError("upstream");
    throw new AssistError("invalid");
  }
  if (response.stop_reason === "refusal") throw new AssistError("refused");
  if (response.stop_reason === "max_tokens") throw new AssistError("truncated");
  const parsed = MeetingOutput.safeParse(response.parsed_output);
  if (!parsed.success) throw new AssistError("invalid");
  return { output: parsed.data, model: response.model };
};
