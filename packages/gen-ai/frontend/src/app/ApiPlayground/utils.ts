// CEAMLS: helpers for the API playground. Pure functions, covered by
// __tests__/utils.spec.ts.
import { AIModel } from '~/app/types';

export type PlaygroundRole = 'system' | 'user' | 'assistant';

export type PlaygroundChatMessage = {
  role: PlaygroundRole;
  content: string;
};

export type PlaygroundUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type PlaygroundRequestBody = {
  model: string;
  messages: PlaygroundChatMessage[];
  temperature: number;
  max_tokens: number;
  stream?: boolean;
  stream_options?: { include_usage: boolean };
};

export type PlaygroundSourceLabel = 'Gateway' | 'Project' | 'External';

/** Models the playground can chat with: ready chat models only. */
export const isApiPlaygroundModel = (model: AIModel): boolean =>
  !!model.model_id &&
  model.model_type !== 'embedding' &&
  model.model_type !== 'transcription' &&
  (model.model_source_type === 'custom_endpoint' || model.status === 'Running');

export const sourceLabel = (model: Pick<AIModel, 'model_source_type'>): PlaygroundSourceLabel => {
  switch (model.model_source_type) {
    case 'maas':
      return 'Gateway';
    case 'custom_endpoint':
      return 'External';
    default:
      return 'Project';
  }
};

/**
 * The name the model server expects in the "model" field of a direct call.
 * Gateway models carry the MaaS catalog id (publishers/<ns>/models/<name>);
 * the server behind the gateway only knows the last part.
 */
export const servedModelName = (model: Pick<AIModel, 'model_id' | 'model_source_type'>): string => {
  if (model.model_source_type === 'maas') {
    const parts = model.model_id.split('/');
    return parts[parts.length - 1] || model.model_id;
  }
  return model.model_id;
};

/**
 * The path of a gateway model under the gateway address: "<namespace>/<name>",
 * from the MaaS catalog id "publishers/<namespace>/models/<name>". The
 * gateway routes a model at /<namespace>/<name>/v1; its root /v1 answers only
 * with an X-Gateway-Model-Name header. Undefined for anything else.
 */
export const gatewayModelPath = (
  model: Pick<AIModel, 'model_id' | 'model_source_type'>,
): string | undefined => {
  if (model.model_source_type !== 'maas') {
    return undefined;
  }
  const parts = model.model_id.split('/');
  if (parts.length === 4 && parts[0] === 'publishers' && parts[2] === 'models') {
    return `${parts[1]}/${parts[3]}`;
  }
  return undefined;
};

/**
 * The base URL for a direct call from outside the cluster, with /v1. A
 * gateway model gets its own path under the gateway address, because the
 * address alone (what the MaaS API reports) is not callable.
 */
export const directBaseUrl = (
  model: Pick<AIModel, 'externalEndpoint' | 'internalEndpoint' | 'model_id' | 'model_source_type'>,
): string | undefined => {
  const url = model.externalEndpoint || model.internalEndpoint;
  if (!url) {
    return undefined;
  }
  let trimmed = url.replace(/\/+$/, '');
  if (trimmed.endsWith('/v1')) {
    trimmed = trimmed.slice(0, -'/v1'.length);
  }
  const path = gatewayModelPath(model);
  if (path && !trimmed.endsWith(`/${path}`)) {
    trimmed = `${trimmed}/${path}`;
  }
  return `${trimmed}/v1`;
};

export const buildRequestBody = (
  model: string,
  systemPrompt: string,
  history: PlaygroundChatMessage[],
  settings: { temperature: number; maxTokens: number; stream: boolean },
): PlaygroundRequestBody => {
  const messages: PlaygroundChatMessage[] = [];
  const system = systemPrompt.trim();
  if (system) {
    messages.push({ role: 'system', content: system });
  }
  history.forEach((m) => {
    if (m.content) {
      messages.push({ role: m.role, content: m.content });
    }
  });
  const body: PlaygroundRequestBody = {
    model,
    messages,
    temperature: settings.temperature,
    /* eslint-disable-next-line camelcase */
    max_tokens: settings.maxTokens,
  };
  if (settings.stream) {
    body.stream = true;
    /* eslint-disable-next-line camelcase */
    body.stream_options = { include_usage: true };
  }
  return body;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const asNumber = (value: unknown): number => (typeof value === 'number' ? value : 0);

/** Reads an OpenAI-style usage object; undefined when there is none. */
export const parseUsage = (payload: unknown): PlaygroundUsage | undefined => {
  if (!isRecord(payload) || !isRecord(payload.usage)) {
    return undefined;
  }
  const { usage } = payload;
  return {
    promptTokens: asNumber(usage.prompt_tokens),
    completionTokens: asNumber(usage.completion_tokens),
    totalTokens: asNumber(usage.total_tokens),
  };
};

const firstChoice = (payload: unknown): Record<string, unknown> | undefined => {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    return undefined;
  }
  const [choice] = payload.choices;
  return isRecord(choice) ? choice : undefined;
};

/** The text of a streamed chunk (choices[0].delta.content). */
export const parseDeltaText = (payload: unknown): string => {
  const choice = firstChoice(payload);
  if (!choice || !isRecord(choice.delta)) {
    return '';
  }
  return typeof choice.delta.content === 'string' ? choice.delta.content : '';
};

/** The text of a whole (non-streamed) completion. */
export const parseMessageText = (payload: unknown): string => {
  const choice = firstChoice(payload);
  if (!choice || !isRecord(choice.message)) {
    return '';
  }
  return typeof choice.message.content === 'string' ? choice.message.content : '';
};

export const parseFinishReason = (payload: unknown): string | undefined => {
  const choice = firstChoice(payload);
  return choice && typeof choice.finish_reason === 'string' ? choice.finish_reason : undefined;
};

/**
 * One line of a server-sent event stream. Returns the parsed JSON of a
 * "data:" line, 'done' for the end marker, or null for anything else.
 */
export const parseSseLine = (line: string): unknown | 'done' | null => {
  const trimmed = line.trim();
  if (!trimmed.startsWith('data:')) {
    return null;
  }
  const data = trimmed.slice('data:'.length).trim();
  if (data === '[DONE]') {
    return 'done';
  }
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
};

/** A readable message from an error body of the BFF or the model server. */
export const errorMessageFromBody = (status: number, bodyText: string): string => {
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    // Not JSON; use the text below.
  }
  let detail = '';
  if (isRecord(parsed)) {
    if (typeof parsed.error === 'string') {
      detail = parsed.error;
    } else if (isRecord(parsed.error) && typeof parsed.error.message === 'string') {
      detail = parsed.error.message;
    } else if (typeof parsed.message === 'string') {
      detail = parsed.message;
    }
  }
  if (!detail) {
    detail = bodyText.trim().slice(0, 300);
  }
  const hint =
    status === 429
      ? 'Your token or request limit for this model is used up for now.'
      : status === 404
        ? 'The model is not available to you in this project.'
        : '';
  return [`HTTP ${status}`, detail, hint].filter(Boolean).join(': ');
};
