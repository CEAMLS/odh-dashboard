// CEAMLS: the API playground. A chat page for the models of the gateway (and
// the project's own deployments) that needs no OGX server and no pasted
// key: the Gen AI BFF session proxy signs each request for the user.
import * as React from 'react';
import { ApplicationsPage } from 'mod-arch-shared';
import { Bullseye, Grid, GridItem, PageSection, Spinner } from '@patternfly/react-core';
import { useLocation, useNavigate } from 'react-router-dom';
import { fireMiscTrackingEvent } from '@odh-dashboard/internal/concepts/analyticsTracking/segmentIOUtils';
import GenAiCoreHeader from '~/app/GenAiCoreHeader';
import PlaygroundIcon from '~/app/images/icons/PlaygroundIcon';
import ModelsEmptyState from '~/app/EmptyStates/NoData';
import { GenAiContext } from '~/app/context/GenAiContext';
import useFetchAIModels from '~/app/hooks/useFetchAIModels';
import { genAiAiAssetsRoute, genAiApiPlaygroundRoute, maasKeysPath } from '~/app/utilities/routes';
import { sendPlaygroundChat } from '~/app/services/apiPlaygroundService';
import { AIModel } from '~/app/types';
import { PlaygroundChatMessage, buildRequestBody, isApiPlaygroundModel } from './utils';
import PlaygroundConversation, { PlaygroundTurn } from './components/PlaygroundConversation';
import PlaygroundSettings, { PlaygroundSettingsValues } from './components/PlaygroundSettings';
import PlaygroundCodeModal from './components/PlaygroundCodeModal';

const DEFAULT_SETTINGS: PlaygroundSettingsValues = {
  temperature: 0.7,
  maxTokens: 1024,
  stream: true,
};

type RouteState = { model?: unknown; modelSourceType?: unknown };

const modelFromRouteState = (state: unknown): RouteState => {
  if (typeof state !== 'object' || state === null) {
    return {};
  }
  return {
    model: 'model' in state ? state.model : undefined,
    modelSourceType: 'modelSourceType' in state ? state.modelSourceType : undefined,
  };
};

const sameModel = (a: AIModel, id: unknown, source: unknown): boolean =>
  a.model_id === id && (typeof source !== 'string' || a.model_source_type === source);

const newId = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const ApiPlaygroundPage: React.FC = () => {
  const { namespace } = React.useContext(GenAiContext);
  const navigate = useNavigate();
  const location = useLocation();
  const { data: allModels, loaded, error } = useFetchAIModels();

  const models = React.useMemo(() => allModels.filter(isApiPlaygroundModel), [allModels]);
  const requested = React.useMemo(() => modelFromRouteState(location.state), [location.state]);

  const [selectedKey, setSelectedKey] = React.useState<string | undefined>();
  const selectedModel = React.useMemo<AIModel | undefined>(() => {
    const byKey = models.find((m) => `${m.model_source_type}/${m.model_id}` === selectedKey);
    if (byKey) {
      return byKey;
    }
    const fromRoute = models.find((m) => sameModel(m, requested.model, requested.modelSourceType));
    return fromRoute ?? models.at(0);
  }, [models, selectedKey, requested]);

  const [subscription, setSubscription] = React.useState<string | undefined>();
  const activeSubscription = React.useMemo(() => {
    const subs = selectedModel?.subscriptions ?? [];
    return subs.some((s) => s.name === subscription) ? subscription : subs[0]?.name;
  }, [selectedModel, subscription]);

  const [settings, setSettings] = React.useState<PlaygroundSettingsValues>(DEFAULT_SETTINGS);
  const [systemPrompt, setSystemPrompt] = React.useState('');
  const [turns, setTurns] = React.useState<PlaygroundTurn[]>([]);
  const [input, setInput] = React.useState('');
  const [isBusy, setIsBusy] = React.useState(false);
  const [codeOpen, setCodeOpen] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => () => abortRef.current?.abort(), []);

  const updateTurn = React.useCallback((id: string, patch: Partial<PlaygroundTurn>) => {
    setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const send = React.useCallback(async () => {
    const text = input.trim();
    if (!text || !selectedModel || !namespace?.name || isBusy) {
      return;
    }
    const history: PlaygroundChatMessage[] = turns
      .filter((t) => !t.error && t.content)
      .map((t) => ({ role: t.role, content: t.content }));
    history.push({ role: 'user', content: text });
    const body = buildRequestBody(selectedModel.model_id, systemPrompt, history, settings);

    const userTurn: PlaygroundTurn = { id: newId(), role: 'user', content: text };
    const replyId = newId();
    setTurns((prev) => [
      ...prev,
      userTurn,
      { id: replyId, role: 'assistant', content: '', pending: true },
    ]);
    setInput('');
    setIsBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    fireMiscTrackingEvent('API Playground Message Sent', {
      modelSourceType: selectedModel.model_source_type,
      stream: settings.stream,
    });

    try {
      const reply = await sendPlaygroundChat(namespace.name, selectedModel, body, {
        subscription: selectedModel.model_source_type === 'maas' ? activeSubscription : undefined,
        signal: controller.signal,
        onDelta: (delta) => {
          setTurns((prev) =>
            prev.map((t) => (t.id === replyId ? { ...t, content: t.content + delta } : t)),
          );
        },
      });
      updateTurn(replyId, {
        content: reply.content,
        usage: reply.usage,
        durationMs: reply.durationMs,
        finishReason: reply.finishReason,
        pending: false,
      });
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === 'AbortError';
      updateTurn(replyId, {
        pending: false,
        error: aborted ? 'Stopped.' : e instanceof Error ? e.message : 'The request failed.',
      });
    } finally {
      abortRef.current = null;
      setIsBusy(false);
    }
  }, [
    input,
    selectedModel,
    namespace,
    isBusy,
    turns,
    systemPrompt,
    settings,
    activeSubscription,
    updateTurn,
  ]);

  const codeBody = React.useMemo(() => {
    if (!selectedModel) {
      return undefined;
    }
    const history: PlaygroundChatMessage[] = turns
      .filter((t) => !t.error && t.content)
      .map((t) => ({ role: t.role, content: t.content }));
    if (input.trim()) {
      history.push({ role: 'user', content: input.trim() });
    }
    if (history.length === 0) {
      history.push({ role: 'user', content: 'Hello' });
    }
    return buildRequestBody(selectedModel.model_id, systemPrompt, history, settings);
  }, [selectedModel, turns, input, systemPrompt, settings]);

  const modelLabel = selectedModel
    ? selectedModel.display_name || selectedModel.model_name || selectedModel.model_id
    : '';
  const hasGatewayModels = allModels.some((m) => m.model_source_type === 'maas');

  let content: React.ReactNode;
  if (!loaded) {
    content = (
      <Bullseye>
        <Spinner />
      </Bullseye>
    );
  } else if (error) {
    content = (
      <ModelsEmptyState
        title="Unable to load models"
        description="There was a problem loading models. Try refreshing the page."
      />
    );
  } else if (models.length === 0) {
    content = (
      <ModelsEmptyState
        title="No model is ready to chat"
        description="The playground uses the models of the gateway page. None is ready in this project yet."
        actionButtonText="Go to the gateway"
        actionButtonHref={genAiAiAssetsRoute(namespace?.name)}
      />
    );
  } else {
    content = (
      <Grid hasGutter>
        <GridItem lg={8} span={12}>
          <PlaygroundConversation
            modelLabel={modelLabel}
            systemPrompt={systemPrompt}
            onChangeSystemPrompt={setSystemPrompt}
            turns={turns}
            input={input}
            onChangeInput={setInput}
            onSend={send}
            onStop={() => abortRef.current?.abort()}
            onClear={() => setTurns([])}
            canSend={!isBusy && !!input.trim() && !!selectedModel}
            isBusy={isBusy}
          />
        </GridItem>
        <GridItem lg={4} span={12}>
          <PlaygroundSettings
            models={models}
            selectedModel={selectedModel}
            onSelectModel={(id) => {
              const target = models.find((m) => m.model_id === id);
              setSelectedKey(target ? `${target.model_source_type}/${target.model_id}` : undefined);
            }}
            subscription={activeSubscription}
            onSelectSubscription={setSubscription}
            settings={settings}
            onChangeSettings={setSettings}
            onViewCode={() => setCodeOpen(true)}
            onOpenKeys={() => navigate(maasKeysPath)}
            showKeysLink={hasGatewayModels}
            isBusy={isBusy}
          />
        </GridItem>
      </Grid>
    );
  }

  return (
    <ApplicationsPage
      title={
        <GenAiCoreHeader
          title="Playground"
          getRedirectPath={genAiApiPlaygroundRoute}
          icon={PlaygroundIcon}
        />
      }
      description="Chat with a model through the gateway, tune the request, and copy the same call as code. Requests use your own account; no API key is needed here."
      loaded
      empty={false}
    >
      <PageSection>{content}</PageSection>
      {codeOpen && selectedModel && codeBody && (
        <PlaygroundCodeModal
          model={selectedModel}
          body={codeBody}
          onClose={() => setCodeOpen(false)}
        />
      )}
    </ApplicationsPage>
  );
};

export default ApiPlaygroundPage;
