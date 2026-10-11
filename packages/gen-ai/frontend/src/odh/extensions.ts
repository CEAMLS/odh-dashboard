import { DataScienceStackComponent } from '@odh-dashboard/plugin-core/areas';
import type {
  NavExtension,
  RouteExtension,
  AreaExtension,
  TaskGroupExtension,
  TaskItemExtension,
} from '@odh-dashboard/plugin-core/extension-points';
import {
  aiAssetsRootPath,
  apiPlaygroundRootPath,
  chatPlaygroundRootPath,
  globAiAssetsAll,
  globApiPlaygroundAll,
  globChatPlaygroundAll,
  globGenAiAll,
} from '~/app/utilities/routes';
import type { AIAssetsTabExtension } from '~/odh/extension-points';

export const PLUGIN_GEN_AI = 'plugin-gen-ai';
export const CHAT_PLAYGROUND = 'chatPlayground';
export const GEN_AI_STUDIO = 'genAiStudio';
export const GEN_AI_TRACING = 'genAiTracing';
export const MODEL_AS_SERVICE = 'model-as-service';
export const MODEL_AS_SERVICE_CAMEL = 'modelAsService';
export const GUARDRAILS = 'guardrails';
export const PROMPT_MANAGEMENT = 'promptManagement';
export const AI_ASSET_CUSTOM_ENDPOINTS = 'aiAssetCustomEndpoints';
export const EXTERNAL_VECTOR_STORES = 'externalVectorStores';
export const AGENT_CONFIG_MANAGEMENT = 'agentConfigManagement';
export const MCP_REGISTRY = 'mcpRegistry';
const MODELS_AS_A_SERVICE_READY = 'ModelsAsAServiceReady';

const extensions: (
  | NavExtension
  | RouteExtension
  | AreaExtension
  | AIAssetsTabExtension
  | TaskGroupExtension
  | TaskItemExtension
)[] = [
  {
    type: 'app.area',
    properties: {
      id: PLUGIN_GEN_AI,
      featureFlags: [GEN_AI_STUDIO],
    },
  },
  {
    type: 'app.area',
    properties: {
      id: CHAT_PLAYGROUND,
      reliantAreas: [PLUGIN_GEN_AI],
      featureFlags: [],
      customCondition: ({ dscStatus }) =>
        ['Managed', 'Unmanaged'].includes(
          dscStatus?.components?.[DataScienceStackComponent.OGX_OPERATOR]?.managementState ?? '',
        ),
    },
  },
  {
    type: 'app.area',
    properties: {
      id: GUARDRAILS,
      reliantAreas: [PLUGIN_GEN_AI],
      featureFlags: [GUARDRAILS],
      requiredComponents: [DataScienceStackComponent.TRUSTY_AI],
    },
  },
  {
    type: 'app.area',
    properties: {
      id: AI_ASSET_CUSTOM_ENDPOINTS,
      reliantAreas: [PLUGIN_GEN_AI],
      featureFlags: [AI_ASSET_CUSTOM_ENDPOINTS],
    },
  },
  {
    type: 'app.area',
    properties: {
      id: PROMPT_MANAGEMENT,
      reliantAreas: [PLUGIN_GEN_AI],
      featureFlags: [PROMPT_MANAGEMENT],
    },
  },
  {
    type: 'app.area',
    properties: {
      id: EXTERNAL_VECTOR_STORES,
      reliantAreas: [PLUGIN_GEN_AI],
      featureFlags: [EXTERNAL_VECTOR_STORES],
    },
  },
  {
    type: 'app.area',
    properties: {
      id: AGENT_CONFIG_MANAGEMENT,
      reliantAreas: [PLUGIN_GEN_AI],
      featureFlags: [AGENT_CONFIG_MANAGEMENT],
    },
  },
  {
    type: 'app.area',
    properties: {
      id: MCP_REGISTRY,
      reliantAreas: [PLUGIN_GEN_AI],
      featureFlags: [MCP_REGISTRY],
    },
  },
  {
    type: 'app.area',
    properties: {
      id: GEN_AI_TRACING,
      reliantAreas: [PLUGIN_GEN_AI],
      featureFlags: [GEN_AI_TRACING],
      customCondition: ({ dsciStatus }) =>
        !!dsciStatus?.conditions.some(
          (c) => c.type === 'OpenTelemetryCollectorAvailable' && c.status === 'True',
        ),
    },
  },
  {
    type: 'app.area',
    properties: {
      id: MODEL_AS_SERVICE_CAMEL,
      reliantAreas: [PLUGIN_GEN_AI],
      featureFlags: [MODEL_AS_SERVICE_CAMEL],
      customCondition: ({ dscStatus }) =>
        !!dscStatus?.conditions.some(
          (c) => c.type === MODELS_AS_A_SERVICE_READY && c.status === 'True',
        ),
    },
  },
  {
    type: 'app.navigation/section',
    flags: {
      required: [PLUGIN_GEN_AI],
    },
    properties: {
      id: 'gen-ai-studio',
      title: 'Gen AI studio',
      group: '4_gen_ai_studio',
      iconRef: () => import('./GenAiStudioNavIcon'),
    },
  },
  {
    type: 'app.navigation/href',
    flags: {
      required: [CHAT_PLAYGROUND],
    },
    properties: {
      id: 'chat-playground',
      title: 'Playground',
      href: chatPlaygroundRootPath,
      section: 'gen-ai-studio',
      path: globChatPlaygroundAll,
      label: 'Tech Preview',
    },
  },
  {
    type: 'app.navigation/href',
    flags: {
      required: [PLUGIN_GEN_AI],
    },
    properties: {
      // CEAMLS: this page lists the model gateway's models, so it is
      // called "Gateway" here, on the page and on the home page.
      id: 'ai-assets',
      title: 'Gateway',
      href: aiAssetsRootPath,
      section: 'gen-ai-studio',
      path: globAiAssetsAll,
      label: 'Tech Preview',
    },
  },
  {
    // CEAMLS: the API playground needs only the Gen AI BFF (no OGX), so it
    // is available whenever the Gen AI studio is.
    type: 'app.navigation/href',
    flags: {
      required: [PLUGIN_GEN_AI],
    },
    properties: {
      id: 'api-playground',
      title: 'Playground',
      href: apiPlaygroundRootPath,
      section: 'gen-ai-studio',
      path: globApiPlaygroundAll,
    },
  },
  {
    type: 'app.route',
    flags: {
      required: [PLUGIN_GEN_AI],
    },
    properties: {
      path: globGenAiAll,
      component: () => import('./GenAiWrapper'),
    },
  },
  // AI Assets Tab Extensions
  {
    type: 'gen-ai.ai-assets/tab',
    flags: {
      required: [PLUGIN_GEN_AI],
    },
    properties: {
      id: 'models',
      title: 'Models',
      component: () => import('../app/AIAssets/AIAssetsModelsTab').then((m) => m.default),
    },
  },
  // CEAMLS: the "MCP servers" tab is not registered. The cluster has no MCP
  // servers and the tab only showed an empty state.
  {
    type: 'gen-ai.ai-assets/tab',
    flags: {
      required: [PLUGIN_GEN_AI, EXTERNAL_VECTOR_STORES],
    },
    properties: {
      id: 'vectorstores',
      title: 'Vector stores',
      component: () => import('../app/AIAssets/AIAssetsVectorStoresTab').then((m) => m.default),
    },
  },
  {
    type: 'gen-ai.ai-assets/tab',
    flags: {
      required: [PLUGIN_GEN_AI, AGENT_CONFIG_MANAGEMENT],
    },
    properties: {
      id: 'agentprofile',
      title: 'Agents',
      component: () => import('../app/AIAssets/AIAssetsAgentProfilesTab').then((m) => m.default),
    },
  },

  // -- Task Assistant --

  {
    type: 'app.task/group',
    properties: {
      id: 'gen-ai-studio',
      title: 'Gen AI studio',
      description: 'Prototype, test, and manage models and applications.',
      label: 'Test gen AI models and apps',
      icon: () => import('./GenAiStudioNavIcon'),
      type: 'organize',
      order: '2_gen_ai_studio',
    },
  },
  {
    type: 'app.task/item',
    flags: {
      required: [CHAT_PLAYGROUND],
    },
    properties: {
      id: 'genai-playground',
      group: 'gen-ai-studio',
      title: 'Chat with models',
      destination: { href: chatPlaygroundRootPath },
      order: '1_playground',
    },
  },
  {
    type: 'app.task/item',
    flags: {
      required: [PLUGIN_GEN_AI],
    },
    properties: {
      id: 'genai-ai-assets',
      group: 'gen-ai-studio',
      title: 'Browse the model gateway',
      destination: { href: aiAssetsRootPath },
      order: '2_ai_assets',
    },
  },
  {
    type: 'app.task/item',
    flags: {
      required: [PLUGIN_GEN_AI],
    },
    properties: {
      id: 'genai-api-playground',
      group: 'gen-ai-studio',
      title: 'Try a model in the playground',
      destination: { href: apiPlaygroundRootPath },
      order: '3_api_playground',
    },
  },
];

export default extensions;
