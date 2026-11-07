/* eslint-disable camelcase */
import type { AIModel } from '~/app/types';
import {
  KEY_ENV,
  KEY_PLACEHOLDER,
  buildApiAccessSample,
  gatewayAddress,
  sortGatewayModels,
} from '~/app/AIAssets/apiAccessSamples';

const gatewayModel: AIModel = {
  model_name: 'glm-5-3',
  model_id: 'publishers/ceamls-models/models/glm-5-3',
  serving_runtime: 'vllm',
  api_protocol: 'openai',
  version: '1',
  usecase: 'chat',
  description: '',
  status: 'Running',
  display_name: 'GLM-5.3',
  model_source_type: 'maas',
  endpoints: [],
  externalEndpoint: 'https://maas.apps.example.edu',
  subscriptions: [{ name: 'standard', displayName: 'Standard' }],
};

const projectModel: AIModel = {
  ...gatewayModel,
  model_id: 'my-model',
  model_name: 'my-model',
  model_source_type: 'namespace',
  externalEndpoint: 'https://my-model.apps.example.edu/v1',
};

describe('API access samples', () => {
  it('keeps gateway models only, ready ones first', () => {
    const stopped: AIModel = {
      ...gatewayModel,
      model_id: 'publishers/ns/models/b',
      status: 'Stopped',
    };
    expect(sortGatewayModels([projectModel, stopped, gatewayModel]).map((m) => m.model_id)).toEqual(
      [gatewayModel.model_id, stopped.model_id],
    );
  });

  it('strips /v1 and slashes from the gateway address', () => {
    expect(gatewayAddress({ externalEndpoint: 'https://maas.apps.example.edu/v1/' })).toBe(
      'https://maas.apps.example.edu',
    );
    expect(gatewayAddress({})).toBeUndefined();
  });

  it('puts the model base URL, the served name and the key variable in every sample', () => {
    const base = 'https://maas.apps.example.edu/ceamls-models/glm-5-3/v1';
    for (const lang of ['python', 'streaming', 'curl', 'javascript'] as const) {
      const code = buildApiAccessSample(lang, { model: gatewayModel });
      expect(code).toContain(base);
      expect(code).toContain('glm-5-3');
      expect(code).toContain(KEY_ENV);
      expect(code).toContain(KEY_PLACEHOLDER);
    }
  });

  it('prints a revealed key in the export line', () => {
    const code = buildApiAccessSample('curl', { model: gatewayModel, key: 'sk-oai-abc' });
    expect(code).toContain(`export ${KEY_ENV}=sk-oai-abc`);
    expect(code).not.toContain(KEY_PLACEHOLDER);
    expect(code).toContain('https://maas.apps.example.edu/maas-api/v1/models');
  });
});
