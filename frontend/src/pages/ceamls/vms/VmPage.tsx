// CEAMLS: one machine: its state, how to connect, the details, the serial
// console, and the actions.
import * as React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Breadcrumb,
  BreadcrumbItem,
  Button,
  Card,
  CardBody,
  CardTitle,
  ClipboardCopy,
  Content,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  EmptyState,
  EmptyStateBody,
  Flex,
  FlexItem,
  Grid,
  GridItem,
  InputGroup,
  InputGroupItem,
  PageSection,
  TextInput,
  Timestamp,
} from '@patternfly/react-core';
import { CopyIcon, EyeIcon, EyeSlashIcon, ExternalLinkAltIcon } from '@patternfly/react-icons';
import { ApplicationsPage } from '@odh-dashboard/ui-core';
import { ProjectDetailsContext } from '#~/pages/projects/ProjectDetailsContext';
import { vmsRoute } from '#~/pages/ceamls/routes';
import { ConfirmDeleteModal, Loading } from '#~/pages/ceamls/buckets/common';
import {
  VM_TUTORIAL_URL,
  deleteVm,
  errorMessage,
  formatMemory,
  useSizes,
  useVm,
  useVmi,
  vmAction,
  vmDisk,
  vmImage,
  vmPassword,
  vmProblem,
  vmSizeName,
  vmState,
  vmUser,
  vmiAddress,
} from './api';
import SerialConsole from './SerialConsole';
import VmStateLabel from './VmState';

const Password: React.FC<{ value: string }> = ({ value }) => {
  const [shown, setShown] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <InputGroup>
      <InputGroupItem isFill>
        <TextInput
          id="ceamls-vm-password"
          type={shown ? 'text' : 'password'}
          value={value}
          readOnlyVariant="default"
          aria-label="Password"
        />
      </InputGroupItem>
      <InputGroupItem>
        <Button
          variant="control"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? 'Hide the password' : 'Show the password'}
          icon={shown ? <EyeSlashIcon /> : <EyeIcon />}
        />
      </InputGroupItem>
      <InputGroupItem>
        <Button variant="control" onClick={copy} aria-label="Copy the password" icon={<CopyIcon />}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </InputGroupItem>
    </InputGroup>
  );
};

const VmPage: React.FC = () => {
  const { currentProject } = React.useContext(ProjectDetailsContext);
  const ns = currentProject.metadata.name;
  const { name = '' } = useParams();
  const navigate = useNavigate();
  const [vm, vmLoaded, vmError] = useVm(ns, name);
  const [vmi] = useVmi(ns, name);
  const [sizes] = useSizes(ns);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [acting, setActing] = React.useState(false);

  const state = vmState(vm);
  const running = state.tone === 'ok';
  const act = (action: 'start' | 'stop' | 'restart') => {
    setActing(true);
    setError(undefined);
    vmAction(ns, name, action)
      .catch((e: unknown) => setError(errorMessage(e)))
      .finally(() => setActing(false));
  };

  const breadcrumb = (
    <Breadcrumb>
      <BreadcrumbItem render={() => <Link to={vmsRoute(ns)}>Virtual machines</Link>} />
      <BreadcrumbItem isActive>{name}</BreadcrumbItem>
    </Breadcrumb>
  );

  if (vmLoaded && !vm) {
    return (
      <ApplicationsPage title={name} breadcrumb={breadcrumb} loaded empty={false}>
        <PageSection hasBodyWrapper={false}>
          <EmptyState headingLevel="h2" titleText="No machine with this name" variant="lg">
            <EmptyStateBody>
              {vmError ? errorMessage(vmError) : 'It may have been deleted.'}{' '}
              <Link to={vmsRoute(ns)}>Back to the list</Link>
            </EmptyStateBody>
          </EmptyState>
        </PageSection>
      </ApplicationsPage>
    );
  }
  if (!vm) {
    return (
      <ApplicationsPage title={name} breadcrumb={breadcrumb} loaded={false} empty={false}>
        <Loading />
      </ApplicationsPage>
    );
  }

  const image = vmImage(vm);
  const user = vmUser(vm);
  const password = vmPassword(vm);
  const size = sizes.find((s) => s.name === vmSizeName(vm));
  const address = vmiAddress(vmi);
  const problem = state.tone === 'bad' ? vmProblem(vm) ?? state.detail : undefined;
  const sshLine = `virtctl ssh ${user}@vm/${name}/${ns}`;

  return (
    <ApplicationsPage
      title={
        <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapMd' }}>
          <FlexItem>{name}</FlexItem>
          <FlexItem>
            <Content component="p" className="pf-v6-u-font-size-md pf-v6-u-font-weight-normal">
              <VmStateLabel state={state} />
            </Content>
          </FlexItem>
        </Flex>
      }
      breadcrumb={breadcrumb}
      loaded
      empty={false}
      headerAction={
        <Flex gap={{ default: 'gapSm' }}>
          {state.tone === 'ok' || state.tone === 'wait' ? (
            <>
              <FlexItem>
                <Button
                  variant="secondary"
                  onClick={() => act('restart')}
                  isDisabled={acting || state.busy}
                  data-testid="ceamls-vm-restart"
                >
                  Restart
                </Button>
              </FlexItem>
              <FlexItem>
                <Button
                  variant="secondary"
                  onClick={() => act('stop')}
                  isDisabled={acting}
                  data-testid="ceamls-vm-stop"
                >
                  Stop
                </Button>
              </FlexItem>
            </>
          ) : (
            <FlexItem>
              <Button
                variant="primary"
                onClick={() => act('start')}
                isDisabled={acting}
                data-testid="ceamls-vm-start"
              >
                Start
              </Button>
            </FlexItem>
          )}
          <FlexItem>
            <Button
              variant="secondary"
              isDanger
              onClick={() => setConfirmDelete(true)}
              isDisabled={acting}
              data-testid="ceamls-vm-delete"
            >
              Delete
            </Button>
          </FlexItem>
        </Flex>
      }
    >
      <PageSection hasBodyWrapper={false}>
        <Flex direction={{ default: 'column' }} gap={{ default: 'gapLg' }}>
          {error && (
            <FlexItem>
              <Alert variant="danger" isInline title="The request failed">
                {error}
              </Alert>
            </FlexItem>
          )}
          {problem && (
            <FlexItem>
              <Alert variant="warning" isInline title="The machine is not running">
                {problem}
              </Alert>
            </FlexItem>
          )}
          <FlexItem>
            <Grid hasGutter>
              <GridItem md={6}>
                <Card isFullHeight>
                  <CardTitle>Connect</CardTitle>
                  <CardBody>
                    <DescriptionList isCompact>
                      <DescriptionListGroup>
                        <DescriptionListTerm>User name</DescriptionListTerm>
                        <DescriptionListDescription>
                          <code>{user}</code>
                        </DescriptionListDescription>
                      </DescriptionListGroup>
                      <DescriptionListGroup>
                        <DescriptionListTerm>Password</DescriptionListTerm>
                        <DescriptionListDescription>
                          {password ? (
                            <Password value={password} />
                          ) : (
                            'This machine was made without a password. Use SSH.'
                          )}
                        </DescriptionListDescription>
                      </DescriptionListGroup>
                      <DescriptionListGroup>
                        <DescriptionListTerm>From your computer</DescriptionListTerm>
                        <DescriptionListDescription>
                          <ClipboardCopy isReadOnly hoverTip="Copy" clickTip="Copied" isCode>
                            {sshLine}
                          </ClipboardCopy>
                          <Content component="small">
                            Needs <code>oc</code> and <code>virtctl</code> signed in, and your SSH
                            key in your profile before the machine was made.{' '}
                            <a href={VM_TUTORIAL_URL} target="_blank" rel="noopener noreferrer">
                              How to set them up <ExternalLinkAltIcon />
                            </a>
                          </Content>
                        </DescriptionListDescription>
                      </DescriptionListGroup>
                    </DescriptionList>
                  </CardBody>
                </Card>
              </GridItem>
              <GridItem md={6}>
                <Card isFullHeight>
                  <CardTitle>Details</CardTitle>
                  <CardBody>
                    <DescriptionList isCompact>
                      <DescriptionListGroup>
                        <DescriptionListTerm>Image</DescriptionListTerm>
                        <DescriptionListDescription>
                          {image?.title ??
                            vm.spec.dataVolumeTemplates?.[0]?.spec.sourceRef?.name ??
                            '—'}
                          {vmi?.status?.guestOSInfo?.prettyName
                            ? ` (${vmi.status.guestOSInfo.prettyName})`
                            : ''}
                        </DescriptionListDescription>
                      </DescriptionListGroup>
                      <DescriptionListGroup>
                        <DescriptionListTerm>Size</DescriptionListTerm>
                        <DescriptionListDescription>
                          {size
                            ? `${size.name} · ${size.cpu} ${
                                size.cpu === 1 ? 'CPU' : 'CPUs'
                              }, ${formatMemory(size.memory)}`
                            : vmSizeName(vm) || '—'}
                        </DescriptionListDescription>
                      </DescriptionListGroup>
                      <DescriptionListGroup>
                        <DescriptionListTerm>Disk</DescriptionListTerm>
                        <DescriptionListDescription>
                          {vmDisk(vm) ? formatMemory(vmDisk(vm)) : '—'}
                        </DescriptionListDescription>
                      </DescriptionListGroup>
                      <DescriptionListGroup>
                        <DescriptionListTerm>Address in the project</DescriptionListTerm>
                        <DescriptionListDescription>
                          {address ? (
                            <code>{address}</code>
                          ) : running ? (
                            'Not yet'
                          ) : (
                            'None while stopped'
                          )}
                        </DescriptionListDescription>
                      </DescriptionListGroup>
                      <DescriptionListGroup>
                        <DescriptionListTerm>Created</DescriptionListTerm>
                        <DescriptionListDescription>
                          {vm.metadata?.creationTimestamp ? (
                            <Timestamp date={new Date(vm.metadata.creationTimestamp)} />
                          ) : (
                            '—'
                          )}
                        </DescriptionListDescription>
                      </DescriptionListGroup>
                    </DescriptionList>
                  </CardBody>
                </Card>
              </GridItem>
              <GridItem span={12}>
                <Card>
                  <CardTitle>Console</CardTitle>
                  <CardBody>
                    <SerialConsole ns={ns} name={name} running={running} user={user} />
                  </CardBody>
                </Card>
              </GridItem>
            </Grid>
          </FlexItem>
        </Flex>
      </PageSection>
      {confirmDelete && (
        <ConfirmDeleteModal
          title="Delete virtual machine?"
          body={
            <>
              This deletes <strong>{name}</strong> and its disk. What is on the disk is lost. Files
              in a bucket stay.
            </>
          }
          confirmLabel="Delete"
          onConfirm={() => deleteVm(ns, name)}
          onDone={() => navigate(vmsRoute(ns))}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </ApplicationsPage>
  );
};

export default VmPage;
