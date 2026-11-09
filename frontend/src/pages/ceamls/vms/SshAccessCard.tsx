// CEAMLS: who may SSH into the machine. A machine starts with its maker on
// the list; the PI, a member or an administrator of the project can be
// added. Each person's keys come from their profile and reach a running
// machine within a minute (planning/vm_pages.md section 12).
import * as React from 'react';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardTitle,
  Content,
  Flex,
  FlexItem,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Icon,
  TextInput,
} from '@patternfly/react-core';
import { CheckCircleIcon, ExclamationCircleIcon, PauseCircleIcon } from '@patternfly/react-icons';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import {
  errorMessage,
  secretKeyName,
  shareVm,
  sshPeople,
  unshareVm,
  useDirectory,
  useVmKeys,
} from './api';
import type { VirtualMachineKind } from './types';

type KeyState = { word: string; tone: 'ok' | 'wait' | 'bad' };

const keyState = (
  email: string,
  mayAccess: boolean | undefined,
  hasKeyInProfile: boolean | undefined,
  inMachine: boolean | undefined,
): KeyState => {
  if (mayAccess === false) {
    return { word: 'Not in the project, gets no key', tone: 'bad' };
  }
  if (inMachine) {
    return { word: 'Key in place', tone: 'ok' };
  }
  if (hasKeyInProfile === false) {
    return { word: 'No key in their profile yet', tone: 'wait' };
  }
  return { word: 'Key on its way', tone: 'wait' };
};

const KeyWord: React.FC<{ state: KeyState }> = ({ state }) => {
  let icon: React.ReactNode;
  switch (state.tone) {
    case 'ok':
      icon = (
        <Icon status="success" isInline>
          <CheckCircleIcon />
        </Icon>
      );
      break;
    case 'bad':
      icon = (
        <Icon status="danger" isInline>
          <ExclamationCircleIcon />
        </Icon>
      );
      break;
    default:
      icon = (
        <Icon isInline>
          <PauseCircleIcon />
        </Icon>
      );
  }
  return (
    <span style={{ whiteSpace: 'nowrap' }}>
      {icon} <span className="pf-v6-u-ml-xs">{state.word}</span>
    </span>
  );
};

type Props = { ns: string; vm: VirtualMachineKind; me: string };

const SshAccessCard: React.FC<Props> = ({ ns, vm, me }) => {
  const name = vm.metadata?.name ?? '';
  const people = sshPeople(vm);
  const directory = useDirectory(ns);
  const inMachine = useVmKeys(ns, name);
  const [email, setEmail] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);

  const who = email.trim().toLowerCase();
  const listed = (people ?? []).includes(who);
  const known = directory ? directory.mayAccess(who) : true;
  const emailOk = /^[^\s@]+@[^\s@]+$/.test(who);
  let hint: string | undefined;
  if (who && !emailOk) {
    hint = 'An email address, as the project lists it.';
  } else if (who && listed) {
    hint = 'Already on the list.';
  } else if (who && !known) {
    hint =
      'Not the PI, a member or an administrator of this project. Ask the PI to add them to the project first.';
  }
  const canAdd = emailOk && !listed && known && !busy;

  const run = (p: Promise<void>) => {
    setBusy(true);
    setError(undefined);
    p.then(() => setEmail(''))
      .catch((e: unknown) => setError(errorMessage(e)))
      .finally(() => setBusy(false));
  };

  if (people === undefined) {
    return (
      <Card data-testid="ceamls-ssh-access">
        <CardTitle>SSH access</CardTitle>
        <CardBody>
          <Content component="p">
            This machine was made before 8 November 2026 and installs the keys of everyone in the
            project. A machine made now has a list of its own.
          </Content>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card data-testid="ceamls-ssh-access">
      <CardTitle>SSH access</CardTitle>
      <CardBody>
        <Flex direction={{ default: 'column' }} gap={{ default: 'gapMd' }}>
          {error && (
            <FlexItem>
              <Alert variant="danger" isInline title="The request failed">
                {error}
              </Alert>
            </FlexItem>
          )}
          <FlexItem>
            {people.length === 0 ? (
              <Content component="p" data-testid="ceamls-ssh-access-empty">
                Nobody has SSH access. Add a person below.
              </Content>
            ) : (
              <Table variant="compact" aria-label="People with SSH access">
                <Thead>
                  <Tr>
                    <Th>Person</Th>
                    <Th>Key</Th>
                    <Th screenReaderText="Actions" />
                  </Tr>
                </Thead>
                <Tbody>
                  {people.map((p) => (
                    <Tr key={p}>
                      <Td dataLabel="Person">
                        {p}
                        {p === me ? ' (you)' : ''}
                      </Td>
                      <Td dataLabel="Key">
                        <KeyWord
                          state={keyState(
                            p,
                            directory?.mayAccess(p),
                            directory?.hasKey(p),
                            inMachine?.includes(secretKeyName(p)),
                          )}
                        />
                      </Td>
                      <Td isActionCell>
                        <Button
                          variant="link"
                          isInline
                          isDisabled={busy}
                          onClick={() => run(unshareVm(ns, vm, p))}
                          data-testid={`ceamls-ssh-remove-${secretKeyName(p)}`}
                        >
                          Remove
                        </Button>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
          </FlexItem>
          <FlexItem>
            <Form
              isHorizontal={false}
              onSubmit={(e) => {
                e.preventDefault();
                if (canAdd) {
                  run(shareVm(ns, vm, who));
                }
              }}
            >
              <FormGroup label="Add a person" fieldId="ceamls-ssh-add">
                <Flex gap={{ default: 'gapSm' }} alignItems={{ default: 'alignItemsFlexStart' }}>
                  <FlexItem grow={{ default: 'grow' }}>
                    <TextInput
                      id="ceamls-ssh-add"
                      type="email"
                      value={email}
                      onChange={(_e, v) => setEmail(v)}
                      placeholder="colleague@morgan.edu"
                      validated={hint ? 'error' : 'default'}
                      aria-label="Email of the person to add"
                    />
                  </FlexItem>
                  <FlexItem>
                    <Button
                      type="submit"
                      variant="secondary"
                      isDisabled={!canAdd}
                      isLoading={busy}
                      data-testid="ceamls-ssh-add-button"
                    >
                      Add
                    </Button>
                  </FlexItem>
                </Flex>
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem variant={hint ? 'error' : 'default'}>
                      {hint ??
                        'The PI, a member or an administrator of the project. Their keys come from their profile and reach the machine within a minute.'}
                    </HelperTextItem>
                  </HelperText>
                </FormHelperText>
              </FormGroup>
            </Form>
          </FlexItem>
        </Flex>
      </CardBody>
    </Card>
  );
};

export default SshAccessCard;
