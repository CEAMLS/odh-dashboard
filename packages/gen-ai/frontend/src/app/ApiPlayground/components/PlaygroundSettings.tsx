import * as React from 'react';
import {
  Button,
  ButtonVariant,
  Card,
  CardBody,
  CardTitle,
  Content,
  Form,
  FormGroup,
  FormSelect,
  FormSelectOption,
  FormSelectOptionGroup,
  Label,
  Switch,
} from '@patternfly/react-core';
import { CodeIcon, KeyIcon } from '@patternfly/react-icons';
import { AIModel } from '~/app/types';
import ModelParameterFormGroup from '~/app/Chatbot/components/ModelParameterFormGroup';
import { PlaygroundSourceLabel, sourceLabel } from '~/app/ApiPlayground/utils';

export type PlaygroundSettingsValues = {
  temperature: number;
  maxTokens: number;
  stream: boolean;
};

type PlaygroundSettingsProps = {
  models: AIModel[];
  selectedModel: AIModel | undefined;
  onSelectModel: (modelId: string) => void;
  subscription: string | undefined;
  onSelectSubscription: (name: string) => void;
  settings: PlaygroundSettingsValues;
  onChangeSettings: (settings: PlaygroundSettingsValues) => void;
  onViewCode: () => void;
  onOpenKeys: () => void;
  showKeysLink: boolean;
  isBusy: boolean;
};

const SOURCE_ORDER: PlaygroundSourceLabel[] = ['Gateway', 'Project', 'External'];

const PlaygroundSettings: React.FC<PlaygroundSettingsProps> = ({
  models,
  selectedModel,
  onSelectModel,
  subscription,
  onSelectSubscription,
  settings,
  onChangeSettings,
  onViewCode,
  onOpenKeys,
  showKeysLink,
  isBusy,
}) => {
  const groups = React.useMemo(
    () =>
      SOURCE_ORDER.map((label) => ({
        label,
        models: models.filter((m) => sourceLabel(m) === label),
      })).filter((g) => g.models.length > 0),
    [models],
  );
  const subscriptions = selectedModel?.subscriptions ?? [];

  return (
    <Card isFullHeight data-testid="api-playground-settings">
      <CardTitle>Settings</CardTitle>
      <CardBody>
        <Form onSubmit={(e) => e.preventDefault()}>
          <FormGroup label="Model" fieldId="api-playground-model">
            <FormSelect
              id="api-playground-model"
              data-testid="api-playground-model-select"
              value={selectedModel?.model_id ?? ''}
              onChange={(_e, value) => onSelectModel(value)}
              isDisabled={isBusy || models.length === 0}
              aria-label="Model"
            >
              {models.length === 0 && <FormSelectOption value="" label="No model is ready" />}
              {groups.map((group) => (
                <FormSelectOptionGroup key={group.label} label={group.label}>
                  {group.models.map((m) => (
                    <FormSelectOption
                      key={`${m.model_source_type}-${m.model_id}`}
                      value={m.model_id}
                      label={m.display_name || m.model_name || m.model_id}
                    />
                  ))}
                </FormSelectOptionGroup>
              ))}
            </FormSelect>
            {selectedModel && (
              <Content component="p" className="pf-v6-u-mt-sm pf-v6-u-font-size-sm">
                <Label isCompact variant="outline" data-testid="api-playground-source">
                  {sourceLabel(selectedModel)}
                </Label>{' '}
                <span className="pf-v6-u-font-family-monospace pf-v6-u-color-200">
                  {selectedModel.model_id}
                </span>
              </Content>
            )}
          </FormGroup>
          {subscriptions.length > 1 && (
            <FormGroup label="Subscription" fieldId="api-playground-subscription">
              <FormSelect
                id="api-playground-subscription"
                value={subscription ?? ''}
                onChange={(_e, value) => onSelectSubscription(value)}
                isDisabled={isBusy}
                aria-label="Subscription"
              >
                {subscriptions.map((s) => (
                  <FormSelectOption key={s.name} value={s.name} label={s.displayName || s.name} />
                ))}
              </FormSelect>
            </FormGroup>
          )}
          <ModelParameterFormGroup
            fieldId="api-playground-temperature"
            label="Temperature"
            helpText="Higher values make the answer more varied; lower values make it more predictable."
            value={settings.temperature}
            onChange={(value) => onChangeSettings({ ...settings, temperature: value })}
            min={0}
            max={2}
            step={0.1}
            isDisabled={isBusy}
          />
          <ModelParameterFormGroup
            fieldId="api-playground-max-tokens"
            label="Max tokens"
            helpText="The longest answer the model can give, in tokens."
            value={settings.maxTokens}
            onChange={(value) => onChangeSettings({ ...settings, maxTokens: Math.round(value) })}
            min={1}
            max={32768}
            step={1}
            isDisabled={isBusy}
          />
          <FormGroup fieldId="api-playground-stream">
            <Switch
              id="api-playground-stream"
              label="Stream the answer"
              isChecked={settings.stream}
              onChange={(_e, checked) => onChangeSettings({ ...settings, stream: checked })}
              isDisabled={isBusy}
            />
          </FormGroup>
          <FormGroup>
            <Button
              variant={ButtonVariant.secondary}
              icon={<CodeIcon />}
              onClick={onViewCode}
              isDisabled={!selectedModel}
              data-testid="api-playground-view-code"
            >
              View code
            </Button>{' '}
            {showKeysLink && (
              <Button
                variant={ButtonVariant.link}
                icon={<KeyIcon />}
                onClick={onOpenKeys}
                data-testid="api-playground-keys-link"
              >
                API keys
              </Button>
            )}
          </FormGroup>
        </Form>
      </CardBody>
    </Card>
  );
};

export default PlaygroundSettings;
