// CEAMLS: the Add variable dialog. Two tabs: one variable (name, value,
// Secret switch) or several from the lines of a .env file. The same dialog
// edits one variable.
import * as React from 'react';
import {
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Switch,
  Tab,
  TabTitleText,
  Tabs,
  TextArea,
  TextInput,
} from '@patternfly/react-core';
import { Td, Th, Thead, Tr, Tbody, Table as PfTable } from '@patternfly/react-table';
import { ContentModal } from '@odh-dashboard/ui-core';
import { setVariables } from './api';
import { guessSecret, nameError, normalizeName, parseDotEnv } from './envUtils';
import type { EnvVar } from './envUtils';

type Props = {
  ns: string;
  by: string;
  existing: EnvVar[];
  mode: 'one' | 'many';
  /** Set when the dialog edits this variable. */
  edit?: EnvVar;
  onClose: () => void;
};

type Parsed = { name: string; value: string; secret: boolean };

const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

export const AddVariableModal: React.FC<Props> = ({ ns, by, existing, mode, edit, onClose }) => {
  const [tab, setTab] = React.useState<'one' | 'many'>(mode);
  const [name, setName] = React.useState(edit?.name ?? '');
  const [nameTouched, setNameTouched] = React.useState(false);
  const [value, setValue] = React.useState(edit?.value ?? '');
  const [secret, setSecret] = React.useState(edit?.secret ?? true);
  const [secretTouched, setSecretTouched] = React.useState(!!edit);
  const [text, setText] = React.useState('');
  const [overrides, setOverrides] = React.useState<Record<string, boolean>>({});
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<Error | undefined>(undefined);

  const onName = (raw: string) => {
    const next = normalizeName(raw);
    setName(next);
    if (!secretTouched) {
      setSecret(guessSecret(next));
    }
  };

  const oneError = nameTouched || name ? nameError(name) : undefined;
  const replaces = !edit && !!name && existing.some((v) => v.name === name);

  const parsed = React.useMemo(() => parseDotEnv(text), [text]);
  const many: Parsed[] = parsed.vars.map((v) => ({
    name: v.name,
    value: v.value,
    secret: overrides[v.name] ?? guessSecret(v.name),
  }));
  const manyReplaces = many.filter((v) => existing.some((e) => e.name === v.name)).length;

  const ready =
    !busy &&
    (tab === 'one'
      ? !nameError(name) && value.length > 0
      : many.length > 0 && parsed.bad.length === 0);

  const submit = () => {
    if (!ready) {
      return;
    }
    setBusy(true);
    setError(undefined);
    const changes = tab === 'one' ? [{ name, value, secret }] : many;
    setVariables(ns, changes, by, existing)
      .then(onClose)
      .catch((e: unknown) => {
        setError(toError(e));
        setBusy(false);
      });
  };

  const oneForm = (
    <Form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <FormGroup label="Name" isRequired fieldId="ceamls-env-name">
        <TextInput
          id="ceamls-env-name"
          data-testid="ceamls-env-name"
          value={name}
          isDisabled={!!edit}
          onChange={(_e, v) => onName(v)}
          onBlur={() => setNameTouched(true)}
          validated={oneError ? 'error' : 'default'}
          placeholder="HF_TOKEN"
          autoFocus={!edit}
        />
        <FormHelperText>
          <HelperText>
            <HelperTextItem variant={oneError ? 'error' : 'default'}>
              {oneError ??
                (replaces
                  ? `${name} exists. Its value is replaced.`
                  : 'Capital letters, digits and underscores. Your code reads the variable with this exact name.')}
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>
      <FormGroup label="Value" isRequired fieldId="ceamls-env-value">
        <TextArea
          id="ceamls-env-value"
          data-testid="ceamls-env-value"
          value={value}
          onChange={(_e, v) => setValue(v)}
          rows={2}
          autoResize
          autoFocus={!!edit}
          aria-label="Value"
        />
      </FormGroup>
      <FormGroup fieldId="ceamls-env-secret">
        <Switch
          id="ceamls-env-secret"
          data-testid="ceamls-env-secret"
          label="Secret"
          isChecked={secret}
          onChange={(_e, checked) => {
            setSecret(checked);
            setSecretTouched(true);
          }}
        />
        <FormHelperText>
          <HelperText>
            <HelperTextItem>
              {secret
                ? 'The value is hidden on this page and in the shell history. Every member of the project can still read it.'
                : 'The value is shown on this page. For a token, a password or a key, turn Secret on.'}
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>
    </Form>
  );

  const manyForm = (
    <Form
      onSubmit={(e) => {
        e.preventDefault();
      }}
    >
      <FormGroup label="Lines of a .env file" isRequired fieldId="ceamls-env-text">
        <TextArea
          id="ceamls-env-text"
          data-testid="ceamls-env-text"
          value={text}
          onChange={(_e, v) => setText(v)}
          rows={6}
          placeholder={'HF_TOKEN=hf_...\nWANDB_ENTITY=my-team\n# a comment'}
          aria-label="Lines of a .env file"
          autoFocus
          style={{ fontFamily: 'var(--pf-t--global--font--family--mono)' }}
        />
        <FormHelperText>
          <HelperText>
            <HelperTextItem variant={parsed.bad.length > 0 ? 'error' : 'default'}>
              {parsed.bad.length > 0
                ? `Not a NAME=value line: ${parsed.bad[0].trim()}`
                : 'One NAME=value per line. Names with TOKEN, KEY, PASSWORD or SECRET start as secrets; change any switch below.'}
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>
      {many.length > 0 && (
        <PfTable variant="compact" aria-label="Variables found" data-testid="ceamls-env-preview">
          <Thead>
            <Tr>
              <Th>Name</Th>
              <Th>Value</Th>
              <Th>Secret</Th>
            </Tr>
          </Thead>
          <Tbody>
            {many.map((v) => (
              <Tr key={v.name}>
                <Td dataLabel="Name">
                  <code>{v.name}</code>
                  {existing.some((e) => e.name === v.name) ? ' (replaced)' : ''}
                </Td>
                <Td dataLabel="Value" modifier="truncate">
                  {v.secret ? '••••••••' : <code>{v.value}</code>}
                </Td>
                <Td dataLabel="Secret">
                  <Switch
                    id={`ceamls-env-many-${v.name}`}
                    aria-label={`${v.name} is a secret`}
                    isChecked={v.secret}
                    onChange={(_e, checked) => setOverrides({ ...overrides, [v.name]: checked })}
                  />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </PfTable>
      )}
    </Form>
  );

  const label =
    tab === 'one'
      ? edit
        ? 'Save'
        : 'Add'
      : many.length > 0
      ? `Add ${many.length}${manyReplaces > 0 ? ` (${manyReplaces} replaced)` : ''}`
      : 'Add';

  return (
    <ContentModal
      variant="medium"
      title={edit ? `Edit ${edit.name}` : 'Add variables'}
      description={
        edit
          ? undefined
          : 'Every workbench and VM that uses the project environment sees a new value after a restart.'
      }
      onClose={onClose}
      dataTestId="ceamls-env-modal"
      error={error}
      alertTitle="The change was not saved"
      contents={
        edit ? (
          oneForm
        ) : (
          <>
            <Tabs
              activeKey={tab}
              onSelect={(_e, key) => setTab(key === 'many' ? 'many' : 'one')}
              aria-label="One variable or several"
              className="pf-v6-u-mb-md"
            >
              <Tab eventKey="one" title={<TabTitleText>One variable</TabTitleText>} />
              <Tab
                eventKey="many"
                title={<TabTitleText>Several from a .env file</TabTitleText>}
                data-testid="ceamls-env-tab-many"
              />
            </Tabs>
            {tab === 'one' ? oneForm : manyForm}
          </>
        )
      }
      buttonActions={[
        {
          label,
          onClick: submit,
          variant: 'primary',
          isLoading: busy,
          isDisabled: !ready,
        },
        { label: 'Cancel', onClick: onClose, variant: 'link', isDisabled: busy },
      ]}
    />
  );
};
