/**
 * OpenAI Provider — encapsulates existing OpenAI integration behind the provider adapter contract.
 * Preserves all current behavior: streaming, tool use, extended thinking support.
 */
import type {
  ModelProvider,
  ProviderMessage,
  ProviderToolDefinition,
  ProviderToolCall,
  ProviderCompletionResult,
  ProviderStreamDelta,
  ProviderCapabilities,
} from "./modelProvider.js";
import { ProviderError } from "./modelProvider.js";

const DEFAULT_MODEL = process.env.AGENT_MODEL ?? "gpt-4.1-mini";
const MAX_THINKING_TOKENS = parseInt(process.env.MAX_THINKING_TOKENS_PER_STEP ?? "300", 10);

interface StreamToolCallDelta {
  index?: number;
  id?: string;
  type?: "function";
  function?: {
    name?: string;
    arguments?: string;
  };
}

interface ChatCompletionsChunk {
  choices?: Array<{
    delta?: {
      content?: string | null;
      tool_calls?: StreamToolCallDelta[];
    };
  }>;
}

export class OpenAIProvider implements ModelProvider {
  readonly providerId = "openai";
  readonly displayName = "OpenAI";
  readonly supportedModels = ["gpt-4.1-mini", "gpt-4.1", "gpt-4o", "gpt-4o-mini", "o1-mini", "o1"];
  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    toolUse: true,
    extendedThinking: true,
  };

  isAvailable(): boolean {
    return !!process.env.OPENAI_API_KEY?.trim();
  }

  async complete(
    messages: ProviderMessage[],
    tools: ProviderToolDefinition[],
    model: string = DEFAULT_MODEL,
    onDelta?: (delta: ProviderStreamDelta) => void
  ): Promise<ProviderCompletionResult> {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw new ProviderError("OPENAI_NO_KEY", "OPENAI_API_KEY not set");
    }

    const isO1 = model.startsWith("o1");
    const body: Record<string, unknown> = {
      model,
      messages,
      stream: true,
    };

    if (tools.length > 0) {
      body.tools = tools;
    }

    if (isO1 && MAX_THINKING_TOKENS > 0) {
      body.max_completion_tokens = MAX_THINKING_TOKENS;
    }

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new ProviderError(
        "OPENAI_API_ERROR",
        `OpenAI API error ${res.status}: ${text}`,
        { statusCode: res.status, retryable: res.status >= 500 || res.status === 429 }
      );
    }

    if (!res.body) {
      throw new ProviderError("OPENAI_NO_BODY", "No response body from OpenAI");
    }

    let content = "";
    const toolCallsAccumulator = new Map<number, ProviderToolCall>();

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop()!;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") continue;

        try {
          const chunk = JSON.parse(data) as ChatCompletionsChunk;
          const delta = chunk.choices?.[0]?.delta;
          if (!delta) continue;

          if (delta.content) {
            content += delta.content;
          }

          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (!toolCallsAccumulator.has(idx)) {
                toolCallsAccumulator.set(idx, {
                  id: tc.id ?? "",
                  type: "function",
                  function: { name: tc.function?.name ?? "", arguments: "" },
                });
              }
              const existing = toolCallsAccumulator.get(idx)!;
              if (tc.id) existing.id = tc.id;
              if (tc.function?.name) existing.function.name = tc.function.name;
              if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
            }
          }

          if (onDelta) {
            onDelta({
              content: delta.content,
              tool_calls: delta.tool_calls,
            });
          }
        } catch {
          // Skip unparseable chunks
        }
      }
    }

    const toolCalls = Array.from(toolCallsAccumulator.values());

    return {
      content: content || null,
      tool_calls: toolCalls,
    };
  }
}

/**
 * Create and return a singleton OpenAI provider instance.
 */
export function createOpenAIProvider(): OpenAIProvider {
  return new OpenAIProvider();
}
