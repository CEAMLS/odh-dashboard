// CEAMLS: the "View code" samples of the API playground. They show the same
// request the page sent, as a direct call to the model's endpoint with the
// user's own credential, so a researcher can move from the page to a script.
import { AIModel } from '~/app/types';
import { PlaygroundRequestBody, directBaseUrl, servedModelName } from './utils';

export type CodeSampleLanguage = 'curl' | 'python' | 'javascript';

export const codeSampleLanguages: { id: CodeSampleLanguage; label: string }[] = [
  { id: 'curl', label: 'curl' },
  { id: 'python', label: 'Python' },
  { id: 'javascript', label: 'JavaScript' },
];

/** What the user puts in the Authorization header for a direct call. */
export const credentialHint = (model: Pick<AIModel, 'model_source_type'>): string => {
  switch (model.model_source_type) {
    case 'maas':
      return 'An API key from the "API keys" page.';
    case 'custom_endpoint':
      return 'The key of the external endpoint.';
    default:
      return 'Your OpenShift token (oc whoami -t).';
  }
};

const KEY_ENV = 'API_KEY';

const directBody = (model: AIModel, body: PlaygroundRequestBody): Record<string, unknown> => {
  const out: Record<string, unknown> = { ...body, model: servedModelName(model) };
  if (!body.stream) {
    delete out.stream;
    delete out.stream_options;
  }
  return out;
};

const indent = (text: string, spaces: number): string =>
  text
    .split('\n')
    .map((line) => (line ? ' '.repeat(spaces) + line : line))
    .join('\n');

const pythonLiteral = (value: unknown): string =>
  JSON.stringify(value, null, 4)
    .replace(/\btrue\b/g, 'True')
    .replace(/\bfalse\b/g, 'False')
    .replace(/\bnull\b/g, 'None');

export const buildCodeSample = (
  language: CodeSampleLanguage,
  model: AIModel,
  body: PlaygroundRequestBody,
): string => {
  const base = directBaseUrl(model) ?? 'https://<model endpoint>/v1';
  const payload = directBody(model, body);
  switch (language) {
    case 'curl':
      return [
        `curl -sS ${base}/chat/completions \\`,
        `  -H "Authorization: Bearer $${KEY_ENV}" \\`,
        '  -H "Content-Type: application/json" \\',
        `  -d '${JSON.stringify(payload, null, 2).replace(/'/g, "'\\''")}'`,
      ].join('\n');
    case 'python': {
      const kwargs = Object.entries(payload)
        .map(([key, value]) => `    ${key}=${indent(pythonLiteral(value), 4).trimStart()},`)
        .join('\n');
      const streamNote = body.stream
        ? [
            'for chunk in response:',
            '    delta = chunk.choices[0].delta.content if chunk.choices else None',
            '    if delta:',
            '        print(delta, end="", flush=True)',
            'print()',
          ]
        : ['print(response.choices[0].message.content)', 'print(response.usage)'];
      return [
        '# pip install openai',
        'import os',
        'from openai import OpenAI',
        '',
        'client = OpenAI(',
        `    base_url="${base}",`,
        `    api_key=os.environ["${KEY_ENV}"],`,
        ')',
        '',
        'response = client.chat.completions.create(',
        kwargs,
        ')',
        ...streamNote,
      ].join('\n');
    }
    case 'javascript':
    default:
      return [
        `const response = await fetch("${base}/chat/completions", {`,
        '  method: "POST",',
        '  headers: {',
        `    Authorization: \`Bearer \${process.env.${KEY_ENV}}\`,`,
        '    "Content-Type": "application/json",',
        '  },',
        `  body: JSON.stringify(${indent(JSON.stringify(payload, null, 2), 2).trimStart()}),`,
        '});',
        body.stream
          ? 'console.log(await response.text()); // server-sent events, one "data:" line per chunk'
          : 'const data = await response.json();\nconsole.log(data.choices[0].message.content, data.usage);',
      ].join('\n');
  }
};
