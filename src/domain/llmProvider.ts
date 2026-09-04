import { ToolDefinition } from './quantTools';

export interface LLMMessage {
  role: 'user' | 'model' | 'assistant' | 'system';
  content?: string;
  rawModelParts?: any[];
  toolCalls?: {
    id?: string;
    name: string;
    args: Record<string, any>;
    thoughtSignature?: string;
    thought_signature?: string;
  }[];
  toolResults?: {
    name: string;
    result: any;
    toolCallId?: string;
  }[];
}

export interface LLMGenerateRequest {
  model: string;
  apiKey?: string;
  baseUrl?: string;
  systemInstruction?: string;
  messages: LLMMessage[];
  tools?: ToolDefinition[];
  temperature?: number;
  thinking?: boolean;
  maxOutputTokens?: number;
}

export interface LLMGenerateResponse {
  text?: string;
  rawModelParts?: any[];
  toolCalls?: {
    id?: string;
    name: string;
    args: Record<string, any>;
    thoughtSignature?: string;
    thought_signature?: string;
  }[];
  rawResponse?: any;
}

export interface LLMProvider {
  name: string;
  generate(req: LLMGenerateRequest): Promise<LLMGenerateResponse>;
}

/**
 * Gemini Frontier Reasoning Model Provider.
 * Connects directly to Google Generative Language v1beta API with function calling,
 * thinking configuration for Gemini 3.1 Pro & 3.8 Flash, and thought_signature preservation.
 */
export class GeminiLLMProvider implements LLMProvider {
  name = 'Gemini Frontier Provider';

  async generate(req: LLMGenerateRequest): Promise<LLMGenerateResponse> {
    const key = req.apiKey?.trim();
    if (!key) {
      throw new Error('Gemini API key is not configured.');
    }

    const modelName = req.model.replace(/^models\//, '');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${key}`;

    // 1. Build tool declarations if tools provided
    const functionDeclarations = req.tools?.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: {
        type: 'OBJECT',
        properties: Object.fromEntries(
          Object.entries(t.parameters.properties).map(([k, v]) => [
            k,
            {
              type: v.type.toUpperCase(),
              description: v.description,
              ...(v.enum ? { enum: v.enum } : {}),
            },
          ])
        ),
        required: t.parameters.required || [],
      },
    }));

    // 2. Format contents according to Gemini function-calling specification
    const contents: any[] = [];

    for (const m of req.messages) {
      if (m.role === 'system') continue; // Handled in systemInstruction

      if (m.toolResults && m.toolResults.length > 0) {
        // Function responses are sent with role: 'user'
        const parts = m.toolResults.map((tr) => ({
          functionResponse: {
            name: tr.name,
            response: { output: tr.result },
          },
        }));
        contents.push({ role: 'user', parts });
      } else if (m.rawModelParts && m.rawModelParts.length > 0) {
        // Crucial for Gemini 3: Preserve original parts including mandatory thought_signature
        contents.push({ role: 'model', parts: m.rawModelParts });
      } else if (m.toolCalls && m.toolCalls.length > 0) {
        // Function calls from model
        const parts = m.toolCalls.map((tc) => {
          const part: any = {
            functionCall: {
              name: tc.name,
              args: tc.args,
            },
          };
          if (tc.thought_signature || tc.thoughtSignature) {
            part.thought_signature = tc.thought_signature || tc.thoughtSignature;
          }
          return part;
        });
        contents.push({ role: 'model', parts });
      } else if (m.content) {
        contents.push({
          role: m.role === 'model' || m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        });
      }
    }

    // Generation Config
    const generationConfig: any = {
      temperature: req.temperature ?? 0.2,
    };

    if (req.maxOutputTokens) {
      generationConfig.maxOutputTokens = req.maxOutputTokens;
    }

    // High thinking/reasoning for Gemini 3 series reasoning models
    if (req.thinking && (modelName.includes('3.1') || modelName.includes('thinking') || modelName.includes('pro'))) {
      generationConfig.thinkingConfig = {
        thinkingBudget: 4096,
      };
    }

    const payload: any = {
      contents,
      generationConfig,
    };

    if (req.systemInstruction) {
      payload.systemInstruction = {
        parts: [{ text: req.systemInstruction }],
      };
    }

    if (functionDeclarations && functionDeclarations.length > 0) {
      payload.tools = [{ functionDeclarations }];
      payload.toolConfig = {
        functionCallingConfig: {
          mode: 'AUTO',
        },
      };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000); // 25s timeout

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': key,
          'User-Agent': 'nexus-quant-agent',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Gemini API error (HTTP ${res.status}): ${errText}`);
      }

      const data = await res.json();
      const candidate = data.candidates?.[0];
      if (!candidate) {
        throw new Error('No candidate returned from Gemini API.');
      }

      const parts = candidate.content?.parts || [];
      let textOutput = '';
      const toolCalls: LLMGenerateResponse['toolCalls'] = [];

      for (const part of parts) {
        if (part.text) {
          textOutput += part.text;
        }
        if (part.functionCall) {
          toolCalls.push({
            id: part.functionCall.id,
            name: part.functionCall.name,
            args: part.functionCall.args || {},
            thoughtSignature: part.thoughtSignature || part.thought_signature,
            thought_signature: part.thought_signature || part.thoughtSignature,
          });
        }
      }

      return {
        text: textOutput || undefined,
        rawModelParts: parts.length > 0 ? parts : undefined,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        rawResponse: data,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * OpenAI Frontier Model Provider (OpenAI, DeepSeek, Local vLLM/Ollama compatible).
 */
export class OpenAILLMProvider implements LLMProvider {
  name = 'OpenAI Compatible Provider';

  async generate(req: LLMGenerateRequest): Promise<LLMGenerateResponse> {
    const key = req.apiKey?.trim();
    if (!key) {
      throw new Error('API key is required for OpenAI provider.');
    }

    const baseUrl = (req.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
    const url = `${baseUrl}/chat/completions`;

    // 1. Build tool declarations if tools provided
    const tools = req.tools?.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    // 2. Format messages
    const messages: any[] = [];
    if (req.systemInstruction) {
      messages.push({ role: 'system', content: req.systemInstruction });
    }

    for (const m of req.messages) {
      if (m.toolResults && m.toolResults.length > 0) {
        for (const tr of m.toolResults) {
          messages.push({
            role: 'tool',
            tool_call_id: tr.toolCallId || tr.name,
            content: typeof tr.result === 'string' ? tr.result : JSON.stringify(tr.result),
          });
        }
      } else if (m.toolCalls && m.toolCalls.length > 0) {
        messages.push({
          role: 'assistant',
          tool_calls: m.toolCalls.map((tc) => ({
            id: tc.id || tc.name,
            type: 'function',
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.args || {}),
            },
          })),
        });
      } else if (m.content) {
        messages.push({
          role: m.role === 'model' ? 'assistant' : m.role,
          content: m.content,
        });
      }
    }

    const payload: any = {
      model: req.model,
      messages,
      temperature: req.temperature ?? 0.2,
    };

    if (tools && tools.length > 0) {
      payload.tools = tools;
    }

    if (req.maxOutputTokens) {
      payload.max_tokens = req.maxOutputTokens;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`OpenAI API error (HTTP ${res.status}): ${errText}`);
      }

      const data = await res.json();
      const choice = data.choices?.[0];
      const msg = choice?.message;

      let toolCalls: LLMGenerateResponse['toolCalls'];
      if (msg?.tool_calls && msg.tool_calls.length > 0) {
        toolCalls = msg.tool_calls.map((tc: any) => {
          let parsedArgs = {};
          try {
            parsedArgs = JSON.parse(tc.function.arguments);
          } catch {
            parsedArgs = {};
          }
          return {
            id: tc.id,
            name: tc.function.name,
            args: parsedArgs,
          };
        });
      }

      return {
        text: msg?.content || undefined,
        toolCalls,
        rawResponse: data,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Local Deterministic Provider.
 * Directly simulates model responses and function calling locally for offline execution and tests.
 */
export class LocalModelProvider implements LLMProvider {
  name = 'Local Deterministic Provider';

  async generate(req: LLMGenerateRequest): Promise<LLMGenerateResponse> {
    const lastUserMsg = [...req.messages].reverse().find((m) => m.role === 'user' && m.content)?.content || '';
    const lower = lastUserMsg.toLowerCase();

    // Check if tools were provided and if this is the initial turn
    const hasToolResults = req.messages.some((m) => m.toolResults && m.toolResults.length > 0);

    if (!hasToolResults && req.tools && req.tools.length > 0) {
      const toolCalls: LLMGenerateResponse['toolCalls'] = [];
      if (lower.includes('risk') || lower.includes('portfolio') || lower.includes('danger')) {
        toolCalls.push({ name: 'calculate_portfolio_risk', args: {} });
      }
      if (lower.includes('btc')) {
        toolCalls.push({ name: 'get_market_snapshot', args: { asset: 'BTC' } });
      } else if (lower.includes('eth')) {
        toolCalls.push({ name: 'get_market_snapshot', args: { asset: 'ETH' } });
      } else if (lower.includes('sol')) {
        toolCalls.push({ name: 'get_market_snapshot', args: { asset: 'SOL' } });
      }

      if (toolCalls.length > 0) {
        return { toolCalls };
      }
    }

    return {
      text: `### Nexus Local Model Response\nAnalysis processed offline via deterministic quantitative tools.\nPrompt: "${lastUserMsg}"`,
    };
  }
}

/**
 * Factory for creating model providers based on user configuration.
 */
export function createLLMProvider(type: 'gemini' | 'openai' | 'local' = 'gemini'): LLMProvider {
  switch (type) {
    case 'openai':
      return new OpenAILLMProvider();
    case 'local':
      return new LocalModelProvider();
    case 'gemini':
    default:
      return new GeminiLLMProvider();
  }
}

/**
 * Routes query to the appropriate model based on query complexity and available credentials.
 */
export function routeQueryToProvider(
  query: string,
  options: {
    geminiKey?: string;
    openAiKey?: string;
    providerPreference?: 'gemini' | 'openai' | 'local';
    selectedModel?: string;
  }
): { provider: LLMProvider; model: string; key: string } {
  const { geminiKey, openAiKey, providerPreference, selectedModel } = options;

  if (providerPreference === 'openai' && openAiKey) {
    return {
      provider: new OpenAILLMProvider(),
      model: selectedModel || 'gpt-4o',
      key: openAiKey,
    };
  }

  if (geminiKey) {
    const isComplex =
      query.length > 100 ||
      query.includes('portfolio') ||
      query.includes('stress') ||
      query.includes('risk') ||
      query.includes('compare') ||
      query.includes('rebalance');

    const chosenModel = selectedModel || (isComplex ? 'gemini-3.1-pro-preview' : 'gemini-3.8-flash');
    return {
      provider: new GeminiLLMProvider(),
      model: chosenModel,
      key: geminiKey,
    };
  }

  return {
    provider: new LocalModelProvider(),
    model: 'nexus-deterministic-quant',
    key: '',
  };
}
