// CEAMLS: the API playground sends chat requests through the Gen AI BFF
// session proxy. The BFF resolves the model's endpoint and, for gateway
// models, mints a short-lived API key for the signed-in user. The page never
// sees a key.
import { API_URL_PREFIX } from '~/app/utilities/const';
import { AIModel } from '~/app/types';
import {
  PlaygroundRequestBody,
  PlaygroundUsage,
  errorMessageFromBody,
  parseDeltaText,
  parseFinishReason,
  parseMessageText,
  parseSseLine,
  parseUsage,
} from '~/app/ApiPlayground/utils';

export type PlaygroundReply = {
  content: string;
  usage?: PlaygroundUsage;
  finishReason?: string;
  durationMs: number;
};

export const playgroundChatUrl = (namespace: string): string =>
  `${API_URL_PREFIX}/api/v1/genai-proxy/ns/${encodeURIComponent(namespace)}/v1/chat/completions`;

type SendOptions = {
  subscription?: string;
  signal?: AbortSignal;
  onDelta?: (text: string) => void;
};

export const sendPlaygroundChat = async (
  namespace: string,
  model: AIModel,
  body: PlaygroundRequestBody,
  { subscription, signal, onDelta }: SendOptions = {},
): Promise<PlaygroundReply> => {
  const started = performance.now();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: body.stream ? 'text/event-stream' : 'application/json',
    'X-Inference-Model-Source-Type': model.model_source_type,
  };
  if (subscription) {
    headers['X-MaaS-Subscription'] = subscription;
  }
  const response = await fetch(playgroundChatUrl(namespace), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    throw new Error(errorMessageFromBody(response.status, await response.text()));
  }

  if (!body.stream) {
    const payload: unknown = await response.json();
    return {
      content: parseMessageText(payload),
      usage: parseUsage(payload),
      finishReason: parseFinishReason(payload),
      durationMs: performance.now() - started,
    };
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('The response has no readable stream.');
  }
  const decoder = new TextDecoder();
  let content = '';
  let usage: PlaygroundUsage | undefined;
  let finishReason: string | undefined;
  let partial = '';

  /** Reads one line; true when the stream's end marker arrived. */
  const consume = (line: string): boolean => {
    const event = parseSseLine(line);
    if (event === null) {
      return false;
    }
    if (event === 'done') {
      return true;
    }
    const delta = parseDeltaText(event);
    if (delta) {
      content += delta;
      onDelta?.(delta);
    }
    usage = parseUsage(event) ?? usage;
    finishReason = parseFinishReason(event) ?? finishReason;
    return false;
  };

  let done = false;
  while (!done) {
    const { value, done: streamDone } = await reader.read();
    if (streamDone) {
      done = true;
      if (partial) {
        consume(partial);
      }
      break;
    }
    partial += decoder.decode(value, { stream: true });
    const lines = partial.split('\n');
    partial = lines.pop() ?? '';
    for (const line of lines) {
      if (consume(line)) {
        done = true;
      }
    }
  }

  return { content, usage, finishReason, durationMs: performance.now() - started };
};
