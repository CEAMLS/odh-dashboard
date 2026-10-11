import type { Extension } from '@openshift/dynamic-plugin-sdk';

// CEAMLS: small changes to the extensions that federated modules (the Gen AI
// studio, MaaS and others served by their own pods) contribute at run time.
// Those modules ship as stock images, so their nav titles and tabs are
// adjusted here, in the host, instead of in a second fork.
//
// - "AI asset endpoints" is the page that lists the model gateway's models,
//   so it is called "Gateway" in the sidebar and on the home page.
// - The "MCP servers" tab of that page is hidden: the cluster has no MCP
//   servers, and the tab only shows an empty state.

const RENAMES: Record<string, string> = {
  'ai-assets': 'Gateway',
  'genai-ai-assets': 'Browse the model gateway',
};

const HIDDEN_TABS: Record<string, string[]> = {
  'gen-ai.ai-assets/tab': ['mcpservers'],
};

const RENAMED_TYPES = ['app.navigation/href', 'app.task/item'];

const extensionId = (ext: Extension): string | undefined => {
  const props: unknown = ext.properties;
  if (typeof props === 'object' && props !== null && 'id' in props) {
    const { id } = props;
    return typeof id === 'string' ? id : undefined;
  }
  return undefined;
};

const overrideExtension = (ext: Extension): Extension | null => {
  const id = extensionId(ext);
  if (!id) {
    return ext;
  }
  if (ext.type in HIDDEN_TABS && HIDDEN_TABS[ext.type].includes(id)) {
    return null;
  }
  if (id in RENAMES && RENAMED_TYPES.includes(ext.type)) {
    return { ...ext, properties: { ...ext.properties, title: RENAMES[id] } };
  }
  return ext;
};

export const applyCeamlsRemoteOverrides = (
  modules: Record<string, Extension[]>,
): Record<string, Extension[]> =>
  Object.fromEntries(
    Object.entries(modules).map(([name, extensions]) => [
      name,
      extensions.map(overrideExtension).filter((e): e is Extension => e !== null),
    ]),
  );
