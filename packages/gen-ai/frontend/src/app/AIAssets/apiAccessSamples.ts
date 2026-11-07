// CEAMLS: the "API access" tab of the Gateway page. Pure helpers, covered
// by __tests__/apiAccessSamples.spec.ts. The samples show how a program
// calls a gateway model with a personal API key, the way a researcher does
// it from a workbench, a VM or a laptop. They follow the gateway demo
// notebook (smoke-test/gateway_demo.ipynb in the cluster repo).
import { AIModel } from '~/app/types';
import { directBaseUrl, servedModelName } from '~/app/ApiPlayground/utils';

/** The environment variable that holds the key in every sample. */
export const KEY_ENV = 'MAAS_API_KEY';

/** What the samples print for the key before a person reveals one. */
export const KEY_PLACEHOLDER = 'sk-oai-...';

export type ApiAccessLanguage = 'python' | 'streaming' | 'curl' | 'javascript';

export const apiAccessLanguages: { id: ApiAccessLanguage; label: string }[] = [
  { id: 'python', label: 'Python' },
  { id: 'streaming', label: 'Python, streaming' },
  { id: 'curl', label: 'curl' },
  { id: 'javascript', label: 'JavaScript' },
];

/** The models the tab is about: what the gateway serves. */
export const isGatewayModel = (model: Pick<AIModel, 'model_source_type'>): boolean =>
  model.model_source_type === 'maas';

/** Ready gateway models first, then the rest, each group in display order. */
export const sortGatewayModels = (models: AIModel[]): AIModel[] =>
  models
    .filter(isGatewayModel)
    .toSorted((a, b) => Number(b.status === 'Running') - Number(a.status === 'Running'));

/**
 * The gateway address alone, with no path: what the MaaS API reports as the
 * external endpoint, less a trailing /v1. The gateway's own catalog answers
 * at <address>/maas-api/v1/models.
 */
export const gatewayAddress = (
  model: Pick<AIModel, 'externalEndpoint' | 'internalEndpoint'>,
): string | undefined => {
  const url = model.externalEndpoint || model.internalEndpoint;
  if (!url) {
    return undefined;
  }
  return url.replace(/\/+$/, '').replace(/\/v1$/, '');
};

export type ApiAccessSampleInput = {
  model: AIModel;
  /** The key to print in the export line; the placeholder when unknown. */
  key?: string;
};

const QUESTION = 'In one sentence, what is Morgan State University?';

export const buildApiAccessSample = (
  language: ApiAccessLanguage,
  { model, key }: ApiAccessSampleInput,
): string => {
  const base = directBaseUrl(model) ?? 'https://<gateway>/<namespace>/<model>/v1';
  const address = gatewayAddress(model) ?? 'https://<gateway>';
  const name = servedModelName(model);
  const shownKey = key ?? KEY_PLACEHOLDER;
  switch (language) {
    case 'python':
      return [
        '# pip install openai',
        `# The key: export ${KEY_ENV}=${shownKey}`,
        '# In a workbench: Edit > Environment variables > Secret, so the key stays out of the notebook.',
        'import os',
        'from openai import OpenAI',
        '',
        `client = OpenAI(base_url="${base}", api_key=os.environ["${KEY_ENV}"])`,
        '',
        'response = client.chat.completions.create(',
        `    model="${name}",`,
        `    messages=[{"role": "user", "content": "${QUESTION}"}],`,
        '    max_tokens=1000,  # the model thinks first, and the thought counts against this budget',
        ')',
        'message = response.choices[0].message',
        'print(message.content)',
        'print(response.usage)',
      ].join('\n');
    case 'streaming':
      return [
        '# pip install openai',
        `# The key: export ${KEY_ENV}=${shownKey}`,
        'import os',
        'from openai import OpenAI',
        '',
        `client = OpenAI(base_url="${base}", api_key=os.environ["${KEY_ENV}"])`,
        '',
        'stream = client.chat.completions.create(',
        `    model="${name}",`,
        '    messages=[{"role": "user", "content": "Give three short tips for a first Python program."}],',
        '    max_tokens=1000,',
        '    stream=True,',
        ')',
        'for chunk in stream:',
        '    if not chunk.choices:',
        '        continue  # the last chunk carries only the usage counts',
        '    delta = chunk.choices[0].delta',
        '    if getattr(delta, "reasoning_content", None):',
        '        continue  # the thought streams here, before the answer',
        '    if delta.content:',
        '        print(delta.content, end="", flush=True)',
        'print()',
      ].join('\n');
    case 'curl':
      return [
        `export ${KEY_ENV}=${shownKey}`,
        '# From your computer, add --cacert ~/router-ca.crt until the cluster has public certificates.',
        '',
        '# The models your key may call',
        `curl -sS ${address}/maas-api/v1/models -H "Authorization: Bearer $${KEY_ENV}"`,
        '',
        '# One answer',
        `curl -sS ${base}/chat/completions \\`,
        `  -H "Authorization: Bearer $${KEY_ENV}" \\`,
        '  -H "Content-Type: application/json" \\',
        `  -d '{"model": "${name}", "messages": [{"role": "user", "content": "${QUESTION}"}], "max_tokens": 1000}'`,
      ].join('\n');
    case 'javascript':
    default:
      return [
        '// npm install openai',
        `// The key: export ${KEY_ENV}=${shownKey}`,
        'import OpenAI from "openai";',
        '',
        `const client = new OpenAI({ baseURL: "${base}", apiKey: process.env.${KEY_ENV} });`,
        '',
        'const response = await client.chat.completions.create({',
        `  model: "${name}",`,
        `  messages: [{ role: "user", content: "${QUESTION}" }],`,
        '  max_tokens: 1000,',
        '});',
        'console.log(response.choices[0].message.content);',
        'console.log(response.usage);',
      ].join('\n');
  }
};
