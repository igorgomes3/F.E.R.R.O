import OpenAI from "openai";
import type { ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";
import type { ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";

export type LlmMessage = { role: "system" | "user" | "assistant"; content: string };

export interface LlmTextRequest {
  apiKey: string;
  endpoint: string;
  model: string;
  protocol: "chat_completions" | "responses";
  messages: LlmMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface LlmTextResult {
  message: string;
  usage: unknown;
}

export function normalizeOpenAIBaseUrl(endpoint: string): string {
  const withoutTrailingSlash = endpoint.trim().replace(/\/+$/, "");
  return withoutTrailingSlash.replace(/\/(?:chat\/completions|responses)$/, "");
}

export async function createTextResponse(request: LlmTextRequest): Promise<LlmTextResult> {
  const client = new OpenAI({
    apiKey: request.apiKey,
    baseURL: normalizeOpenAIBaseUrl(request.endpoint),
  });

  if (request.protocol === "responses") {
    const systemMessage = request.messages.find((message) => message.role === "system");
    const responsePayload = {
      model: request.model,
      ...(systemMessage && { instructions: systemMessage.content }),
      input: request.messages.filter((message) => message !== systemMessage),
      temperature: request.temperature,
      max_output_tokens: request.maxTokens,
    } satisfies ResponseCreateParamsNonStreaming;

    const response = await client.responses.create(responsePayload);

    return { message: response.output_text ?? "", usage: response.usage ?? null };
  }

  const isGlm = request.model.toLowerCase().includes("glm");
  type GlmThinkingExtension = { thinking: { type: "disabled" } };
  const glmThinking = isGlm ? ({ thinking: { type: "disabled" } } satisfies GlmThinkingExtension) : {};
  const chatPayload: ChatCompletionCreateParamsNonStreaming & Partial<GlmThinkingExtension> = {
    model: request.model,
    messages: request.messages,
    temperature: request.temperature,
    max_tokens: request.maxTokens,
    ...glmThinking,
  };

  const completion = await client.chat.completions.create(chatPayload);

  return {
    message: completion.choices?.[0]?.message?.content ?? "",
    usage: completion.usage ?? null,
  };
}
