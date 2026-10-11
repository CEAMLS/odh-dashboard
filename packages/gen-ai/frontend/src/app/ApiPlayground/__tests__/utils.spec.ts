/* eslint-disable camelcase */
import { AIModel } from '~/app/types';
import {
  buildRequestBody,
  directBaseUrl,
  errorMessageFromBody,
  isApiPlaygroundModel,
  parseDeltaText,
  parseMessageText,
  parseSseLine,
  parseUsage,
  servedModelName,
  sourceLabel,
} from '~/app/ApiPlayground/utils';
import { buildCodeSample } from '~/app/ApiPlayground/codeSamples';

const baseModel: AIModel = {
  model_name: 'gemma-4-31b-it',
  model_id: 'publishers/ceamls-models/models/gemma-4-31b-it',
  serving_runtime: '',
  api_protocol: 'v1',
  version: '',
  usecase: '',
  description: '',
  endpoints: [],
  status: 'Running',
  display_name: 'Gemma 4 31B',
  model_source_type: 'maas',
  externalEndpoint: 'https://maas.apps.example.edu/ceamls-models/gemma-4-31b-it/v1',
};

describe('API playground utils', () => {
  it('keeps only ready chat models', () => {
    expect(isApiPlaygroundModel(baseModel)).toBe(true);
    expect(isApiPlaygroundModel({ ...baseModel, status: 'Stop' })).toBe(false);
    expect(isApiPlaygroundModel({ ...baseModel, model_type: 'embedding' })).toBe(false);
    expect(
      isApiPlaygroundModel({ ...baseModel, status: 'Stop', model_source_type: 'custom_endpoint' }),
    ).toBe(true);
  });

  it('labels the source', () => {
    expect(sourceLabel(baseModel)).toBe('Gateway');
    expect(sourceLabel({ model_source_type: 'namespace' })).toBe('Project');
    expect(sourceLabel({ model_source_type: 'custom_endpoint' })).toBe('External');
  });

  it('uses the last part of a gateway id as the served name', () => {
    expect(servedModelName(baseModel)).toBe('gemma-4-31b-it');
    expect(servedModelName({ model_id: 'my-model', model_source_type: 'namespace' })).toBe(
      'my-model',
    );
  });

  it('adds /v1 to a base URL once', () => {
    expect(directBaseUrl(baseModel)).toBe(baseModel.externalEndpoint);
    expect(directBaseUrl({ externalEndpoint: 'https://x.example/' })).toBe('https://x.example/v1');
    expect(directBaseUrl({})).toBeUndefined();
  });

  it('builds the request body with the system prompt first', () => {
    const body = buildRequestBody('m', ' be brief ', [{ role: 'user', content: 'hi' }], {
      temperature: 0.5,
      maxTokens: 10,
      stream: true,
    });
    expect(body.messages).toEqual([
      { role: 'system', content: 'be brief' },
      { role: 'user', content: 'hi' },
    ]);
    expect(body.stream).toBe(true);
    expect(body.stream_options).toEqual({ include_usage: true });
    expect(body.max_tokens).toBe(10);
    const plain = buildRequestBody('m', '', [{ role: 'user', content: 'hi' }], {
      temperature: 0.5,
      maxTokens: 10,
      stream: false,
    });
    expect(plain.stream).toBeUndefined();
    expect(plain.messages).toHaveLength(1);
  });

  it('parses server-sent event lines', () => {
    expect(parseSseLine('')).toBeNull();
    expect(parseSseLine(': keep-alive')).toBeNull();
    expect(parseSseLine('data: [DONE]')).toBe('done');
    expect(parseSseLine('data: not json')).toBeNull();
    const chunk = parseSseLine('data: {"choices":[{"delta":{"content":"Hi"}}]}');
    expect(parseDeltaText(chunk)).toBe('Hi');
    expect(parseDeltaText({ choices: [{ delta: {} }] })).toBe('');
  });

  it('reads the message text and the usage', () => {
    const payload = {
      choices: [{ message: { content: 'Hello' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
    };
    expect(parseMessageText(payload)).toBe('Hello');
    expect(parseUsage(payload)).toEqual({ promptTokens: 3, completionTokens: 2, totalTokens: 5 });
    expect(parseUsage({ choices: [] })).toBeUndefined();
  });

  it('explains error bodies', () => {
    expect(errorMessageFromBody(429, '{"error":{"message":"limit"}}')).toBe(
      'HTTP 429: limit: Your token or request limit for this model is used up for now.',
    );
    expect(errorMessageFromBody(500, 'boom')).toBe('HTTP 500: boom');
    expect(errorMessageFromBody(404, '')).toBe(
      'HTTP 404: The model is not available to you in this project.',
    );
  });

  it('renders code samples with the served model name and the base URL', () => {
    const body = buildRequestBody(baseModel.model_id, '', [{ role: 'user', content: "it's" }], {
      temperature: 0.7,
      maxTokens: 64,
      stream: false,
    });
    const curl = buildCodeSample('curl', baseModel, body);
    expect(curl).toContain(`${baseModel.externalEndpoint ?? ''}/chat/completions`);
    expect(curl).toContain('"model": "gemma-4-31b-it"');
    expect(curl).not.toContain('publishers/');
    expect(curl).toContain("it'\\''s");
    const python = buildCodeSample('python', baseModel, body);
    expect(python).toContain('from openai import OpenAI');
    expect(python).toContain('model="gemma-4-31b-it"');
    expect(python).not.toContain('stream_options');
    const js = buildCodeSample('javascript', baseModel, { ...body, stream: true });
    expect(js).toContain('"stream": true');
    expect(js).toContain('response.text()');
  });
});
