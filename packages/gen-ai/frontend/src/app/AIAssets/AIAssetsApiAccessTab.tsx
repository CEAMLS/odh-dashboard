// CEAMLS: the "API access" tab of the Gateway page. How a program calls a
// gateway model: the base URL, the model name, a personal API key, and the
// same call in Python (the openai SDK), curl and JavaScript. It mirrors the
// Access keys tab of the Buckets page.
import * as React from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  Bullseye,
  Button,
  ClipboardCopy,
  ClipboardCopyButton,
  CodeBlock,
  CodeBlockAction,
  CodeBlockCode,
  Content,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  EmptyState,
  EmptyStateBody,
  FormSelect,
  FormSelectOption,
  Grid,
  GridItem,
  InputGroup,
  InputGroupItem,
  Spinner,
  Tab,
  TabTitleText,
  Tabs,
  TextInput,
  Title,
} from '@patternfly/react-core';
import { EyeIcon, EyeSlashIcon } from '@patternfly/react-icons';
import useMergedModels from '~/app/hooks/useMergedModels';
import useGenerateMaaSToken from '~/app/hooks/useGenerateMaaSToken';
import { maasKeysPath } from '~/app/utilities/routes';
import { directBaseUrl, servedModelName } from '~/app/ApiPlayground/utils';
import {
  apiAccessLanguages,
  buildApiAccessSample,
  gatewayAddress,
  sortGatewayModels,
} from './apiAccessSamples';

// The docs site of the cluster. The hub has no setting for it; the Chat
// item in the host's ceamls.ts carries its address the same way.
const TRUST_CERT_DOCS =
  'https://console.apps.ceamls.morgan.edu/docs/cluster/trust-the-certificate/';

const AIAssetsApiAccessTab: React.FC = () => {
  const { models, loaded, error } = useMergedModels();
  const gatewayModels = React.useMemo(() => sortGatewayModels(models), [models]);
  const [selectedId, setSelectedId] = React.useState<string>('');
  const model = gatewayModels.find((m) => m.model_id === selectedId) ?? gatewayModels.at(0);

  const {
    isGenerating,
    tokenData,
    error: tokenError,
    generateToken,
    resetToken,
  } = useGenerateMaaSToken();
  const [shown, setShown] = React.useState(false);
  const [tab, setTab] = React.useState<string | number>('python');
  const [copied, setCopied] = React.useState<string | undefined>(undefined);
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  React.useEffect(() => () => clearTimeout(timer.current), []);

  const flashCopied = (what: string) => {
    setCopied(what);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(undefined), 1500);
  };

  if (!loaded) {
    return (
      <Bullseye>
        <Spinner />
      </Bullseye>
    );
  }
  if (error) {
    return (
      <EmptyState headingLevel="h2" titleText="The gateway did not answer" variant="sm">
        <EmptyStateBody>{error.message}</EmptyStateBody>
      </EmptyState>
    );
  }
  if (!model) {
    return (
      <EmptyState
        headingLevel="h2"
        titleText="No gateway model for this project"
        variant="sm"
        data-testid="api-access-empty"
      >
        <EmptyStateBody>
          The model gateway serves no model to this project yet. Your API keys are on the{' '}
          <Link to={maasKeysPath}>API keys</Link> page.
        </EmptyStateBody>
      </EmptyState>
    );
  }

  const base = directBaseUrl(model) ?? '';
  const address = gatewayAddress(model) ?? '';
  const name = servedModelName(model);
  const subscription = model.subscriptions?.[0];
  const key = tokenData && shown ? tokenData.key : undefined;

  return (
    <Grid hasGutter md={6}>
      <GridItem>
        <Title headingLevel="h2" className="pf-v6-u-mb-md">
          Connect
        </Title>
        <DescriptionList>
          <DescriptionListGroup>
            <DescriptionListTerm>Model</DescriptionListTerm>
            <DescriptionListDescription>
              {gatewayModels.length > 1 ? (
                <FormSelect
                  id="api-access-model"
                  value={model.model_id}
                  onChange={(_e, value) => setSelectedId(value)}
                  aria-label="Model"
                  data-testid="api-access-model"
                >
                  {gatewayModels.map((m) => (
                    <FormSelectOption
                      key={m.model_id}
                      value={m.model_id}
                      label={
                        m.status === 'Running'
                          ? m.display_name || m.model_name
                          : `${m.display_name || m.model_name} (not ready)`
                      }
                    />
                  ))}
                </FormSelect>
              ) : (
                <span data-testid="api-access-model">
                  {model.display_name || model.model_name}
                  {model.status === 'Running' ? '' : ' (not ready)'}
                </span>
              )}
            </DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>Base URL</DescriptionListTerm>
            <DescriptionListDescription>
              <ClipboardCopy
                isReadOnly
                hoverTip="Copy"
                clickTip="Copied"
                data-testid="api-access-base-url"
              >
                {base}
              </ClipboardCopy>
              <Content component="small" className="pf-v6-u-color-200">
                For an OpenAI client. The same address works from a workbench, a VM and your
                computer.
              </Content>
            </DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>Model name in a request</DescriptionListTerm>
            <DescriptionListDescription>
              <ClipboardCopy isReadOnly hoverTip="Copy" clickTip="Copied">
                {name}
              </ClipboardCopy>
            </DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>Gateway address</DescriptionListTerm>
            <DescriptionListDescription>
              <ClipboardCopy isReadOnly hoverTip="Copy" clickTip="Copied">
                {address}
              </ClipboardCopy>
              <Content component="small" className="pf-v6-u-color-200">
                <code>{address}/maas-api/v1/models</code> lists the models your key may call.
              </Content>
            </DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>API key</DescriptionListTerm>
            <DescriptionListDescription>
              <Content component="p">
                A key of your own is the bearer token. It carries your daily token budget
                {subscription ? ` (${subscription.displayName || subscription.name})` : ''}. Make a
                lasting key on the <Link to={maasKeysPath}>API keys</Link> page, or a key for one
                hour here.
              </Content>
              {tokenData ? (
                <>
                  <InputGroup className="pf-v6-u-mt-sm">
                    <InputGroupItem isFill>
                      <TextInput
                        id="api-access-key"
                        type={shown ? 'text' : 'password'}
                        value={tokenData.key}
                        readOnlyVariant="default"
                        aria-label="Temporary API key"
                        data-testid="api-access-key"
                      />
                    </InputGroupItem>
                    <InputGroupItem>
                      <Button
                        variant="control"
                        onClick={() => setShown((v) => !v)}
                        aria-label={shown ? 'Hide the key' : 'Show the key'}
                        icon={shown ? <EyeSlashIcon /> : <EyeIcon />}
                      />
                    </InputGroupItem>
                    <InputGroupItem>
                      <ClipboardCopyButton
                        id="api-access-key-copy"
                        textId="api-access-key"
                        variant="control"
                        onClick={() => {
                          void navigator.clipboard.writeText(tokenData.key);
                          flashCopied('key');
                        }}
                        exitDelay={copied === 'key' ? 1500 : 600}
                        aria-label="Copy the key"
                      >
                        {copied === 'key' ? 'Copied' : 'Copy'}
                      </ClipboardCopyButton>
                    </InputGroupItem>
                  </InputGroup>
                  <Content component="small" className="pf-v6-u-color-200">
                    This key stops working in one hour and is not listed on the API keys page. Copy
                    it now.{' '}
                    <Button
                      variant="link"
                      isInline
                      onClick={() => {
                        resetToken();
                        setShown(false);
                      }}
                    >
                      Clear
                    </Button>
                  </Content>
                </>
              ) : (
                <Button
                  variant="secondary"
                  className="pf-v6-u-mt-sm"
                  isDisabled={isGenerating}
                  icon={isGenerating ? <Spinner size="sm" /> : undefined}
                  onClick={() => generateToken(undefined, subscription?.name)}
                  data-testid="api-access-generate"
                >
                  Make a key for one hour
                </Button>
              )}
              {tokenError && (
                <Alert
                  variant="danger"
                  isInline
                  isPlain
                  title={tokenError}
                  className="pf-v6-u-mt-sm"
                />
              )}
            </DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>From your computer</DescriptionListTerm>
            <DescriptionListDescription>
              Workbenches and VMs trust the cluster certificate already. Your computer must{' '}
              <a href={TRUST_CERT_DOCS} target="_blank" rel="noreferrer">
                trust it first
              </a>
              , until the cluster has public certificates.
            </DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>Thinking</DescriptionListTerm>
            <DescriptionListDescription>
              A model that thinks before it answers returns the thought as{' '}
              <code>reasoning_content</code>, and the thought counts against <code>max_tokens</code>
              . Give it room, 1000 tokens or more, or the answer comes back empty with{' '}
              <code>finish_reason</code> &quot;length&quot;. <code>reasoning_effort</code> (low,
              high, max) sets how long it thinks.
            </DescriptionListDescription>
          </DescriptionListGroup>
        </DescriptionList>
      </GridItem>
      <GridItem>
        <Title headingLevel="h2" className="pf-v6-u-mb-md">
          Call the model
        </Title>
        <Tabs activeKey={tab} onSelect={(_e, k) => setTab(k)} isBox={false} aria-label="Examples">
          {apiAccessLanguages.map((lang) => {
            const code = buildApiAccessSample(lang.id, { model, key });
            return (
              <Tab
                key={lang.id}
                eventKey={lang.id}
                title={<TabTitleText>{lang.label}</TabTitleText>}
              >
                <CodeBlock
                  className="pf-v6-u-mt-md"
                  actions={
                    <CodeBlockAction>
                      <ClipboardCopyButton
                        id={`api-access-copy-${lang.id}`}
                        textId={`api-access-code-${lang.id}`}
                        variant="plain"
                        onClick={() => {
                          void navigator.clipboard.writeText(code);
                          flashCopied(lang.id);
                        }}
                        exitDelay={copied === lang.id ? 1500 : 600}
                        aria-label="Copy to clipboard"
                      >
                        {copied === lang.id ? 'Copied' : 'Copy'}
                      </ClipboardCopyButton>
                    </CodeBlockAction>
                  }
                >
                  <CodeBlockCode
                    id={`api-access-code-${lang.id}`}
                    data-testid={`api-access-code-${lang.id}`}
                  >
                    {code}
                  </CodeBlockCode>
                </CodeBlock>
              </Tab>
            );
          })}
        </Tabs>
        <Content component="p" className="pf-v6-u-mt-sm pf-v6-u-color-200">
          {key
            ? 'The examples carry your temporary key. Keep them out of shared files.'
            : 'The examples read the key from the environment variable MAAS_API_KEY. Reveal a key on the left to see it filled in.'}
        </Content>
      </GridItem>
    </Grid>
  );
};

export default AIAssetsApiAccessTab;
