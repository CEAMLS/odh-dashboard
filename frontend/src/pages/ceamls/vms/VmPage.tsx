// CEAMLS: one machine: its state, how to connect, the details, what it
// uses, the serial console, its activity, its snapshots, and the actions.
// The second version (planning/vm_pages.md section 10 in the cluster repo).
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
  PageSection,
  Timestamp,
  Tooltip,
} from '@patternfly/react-core';
import { ExternalLinkAltIcon } from '@patternfly/react-icons';
import { ApplicationsPage } from '@odh-dashboard/ui-core';
import { ProjectDetailsContext } from '#~/pages/projects/ProjectDetailsContext';
import { vmConsoleRoute, vmsRoute } from '#~/pages/ceamls/routes';
import { ConfirmDeleteModal, Loading } from '#~/pages/ceamls/buckets/common';
import {
  VM_TUTORIAL_URL,
  agentUp,
  copyProgress,
  deleteVm,
  diskUseLine,
  errorMessage,
  formatMemory,
  liveKeys,
  memoryBytesOf,
  rootFilesystem,
  useMyKeyInProject,
  useDataVolume,
  useFilesystems,
  useGuestOsInfo,
  useSizes,
  useVm,
  useVmi,
  vmAction,
  vmDisk,
  vmImage,
  vmPassword,
  vmProblem,
  vmSize,
  vmSizeName,
  vmState,
  sizeLabel,
  vmUser,
  vmiAddress,
} from './api';
import ActivityCard from './ActivityCard';
import BootLog from './BootLog';
import SerialConsole from './SerialConsole';
import SnapshotsCard from './SnapshotsCard';
import UsageCard from './UsageCard';
import VmStateLabel from './VmState';
import Password from './Password';

const VmPage: React.FC = () => {
  const { currentProject } = React.useContext(ProjectDetailsContext);
  const ns = currentProject.metadata.name;
  const { name = '' } = useParams();
  const navigate = useNavigate();
  const [vm, vmLoaded, vmError] = useVm(ns, name);
  const [vmi] = useVmi(ns, name);
  const [sizes] = useSizes(ns);
  const hasKey = useMyKeyInProject(ns);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [acting, setActing] = React.useState(false);
  const [restoring, setRestoring] = React.useState(false);

  const state = vmState(vm, vmi);
  const running = state.tone === 'ok';
  const starting = state.tone === 'wait';
  // What the guest agent knows: only while the OS is up.
  const guestReady = running && agentUp(vmi);
  const [guest] = useGuestOsInfo(ns, name, guestReady);
  const [filesystems] = useFilesystems(ns, name, guestReady);
  const [dataVolume] = useDataVolume(ns, name);
  const progress = starting ? copyProgress(dataVolume) : undefined;
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
  const size = vmSize(vm, sizes);
  // The watch keeps the last instance after a stop, so read the address
  // only while the machine runs.
  const address = running ? vmiAddress(vmi) : undefined;
  const problem = state.tone === 'bad' ? vmProblem(vm) : undefined;
  const sshLine = `ceamls vm ssh ${name} -p ${ns}`;
  const live = liveKeys(vm);

  return (
    <ApplicationsPage
      title={
        <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapMd' }}>
          <FlexItem>{name}</FlexItem>
          <FlexItem>
            <Content component="p" className="pf-v6-u-font-size-md pf-v6-u-font-weight-normal">
              <VmStateLabel
                state={restoring ? { word: 'Restoring', tone: 'wait', busy: true } : state}
              />
            </Content>
          </FlexItem>
        </Flex>
      }
      breadcrumb={breadcrumb}
      loaded
      empty={false}
      headerAction={
        <Flex gap={{ default: 'gapSm' }}>
          <FlexItem>
            {running ? (
              <Button
                variant="primary"
                component="a"
                href={vmConsoleRoute(ns, name)}
                target="_blank"
                rel="noopener noreferrer"
                icon={<ExternalLinkAltIcon />}
                iconPosition="end"
                data-testid="ceamls-vm-connect"
              >
                Connect
              </Button>
            ) : (
              <Tooltip
                content={starting ? 'Ready when the OS is up.' : 'Start the machine to connect.'}
              >
                <Button
                  variant="primary"
                  isAriaDisabled
                  icon={<ExternalLinkAltIcon />}
                  iconPosition="end"
                  data-testid="ceamls-vm-connect"
                >
                  Connect
                </Button>
              </Tooltip>
            )}
          </FlexItem>
          {state.tone === 'ok' || state.tone === 'wait' ? (
            <>
              <FlexItem>
                <Button
                  variant="secondary"
                  onClick={() => act('restart')}
                  isDisabled={acting || state.busy || restoring}
                  data-testid="ceamls-vm-restart"
                >
                  Restart
                </Button>
              </FlexItem>
              <FlexItem>
                <Button
                  variant="secondary"
                  onClick={() => act('stop')}
                  isDisabled={acting || restoring}
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
                isDisabled={acting || restoring}
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
              isDisabled={acting || restoring}
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
          {progress && (
            <FlexItem>
              <Alert
                variant="info"
                isInline
                isPlain
                title={progress}
                data-testid="ceamls-vm-progress"
              >
                The first start copies the image. Later starts take seconds.
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
                          <Content component="small" data-testid="ceamls-ssh-hint">
                            {hasKey === false ? (
                              <>
                                Your profile has no SSH key yet. Run{' '}
                                <code>ceamls ssh-key setup</code> on your computer.{' '}
                                {live
                                  ? 'This machine gets the key within a minute.'
                                  : 'This machine took keys at its first boot only, so make it again after that.'}
                              </>
                            ) : live ? (
                              <>
                                Needs the <code>ceamls</code> command signed in, and your SSH key in
                                your profile (<code>ceamls ssh-key setup</code>).
                              </>
                            ) : (
                              <>
                                Needs the <code>ceamls</code> command signed in. This machine took
                                the keys from your profile at its first boot only; a key added since
                                is not in it.
                              </>
                            )}{' '}
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
                        </DescriptionListDescription>
                      </DescriptionListGroup>
                      <DescriptionListGroup>
                        <DescriptionListTerm>Operating system</DescriptionListTerm>
                        <DescriptionListDescription data-testid="ceamls-vm-os">
                          {guest?.os?.prettyName ??
                            vmi?.status?.guestOSInfo?.prettyName ??
                            (running ? 'Waiting for the machine' : '—')}
                        </DescriptionListDescription>
                      </DescriptionListGroup>
                      <DescriptionListGroup>
                        <DescriptionListTerm>Hostname</DescriptionListTerm>
                        <DescriptionListDescription>
                          {guest?.hostname ? (
                            <code>{guest.hostname}</code>
                          ) : running ? (
                            'Waiting for the machine'
                          ) : (
                            '—'
                          )}
                        </DescriptionListDescription>
                      </DescriptionListGroup>
                      <DescriptionListGroup>
                        <DescriptionListTerm>Size</DescriptionListTerm>
                        <DescriptionListDescription>
                          {size ? sizeLabel(size) : vmSizeName(vm) || '—'}
                        </DescriptionListDescription>
                      </DescriptionListGroup>
                      <DescriptionListGroup>
                        <DescriptionListTerm>Disk</DescriptionListTerm>
                        <DescriptionListDescription data-testid="ceamls-vm-disk">
                          {(() => {
                            const root = rootFilesystem(filesystems);
                            if (root) {
                              return diskUseLine(root);
                            }
                            const diskSize = vmDisk(vm) ? formatMemory(vmDisk(vm)) : '—';
                            return running ? `${diskSize}, use not known yet` : diskSize;
                          })()}
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
                <UsageCard
                  ns={ns}
                  name={name}
                  running={running}
                  cpus={size?.cpu}
                  memoryBytes={size ? memoryBytesOf(size.memory) : undefined}
                />
              </GridItem>
              <GridItem span={12}>
                <Card>
                  <CardTitle>Console</CardTitle>
                  <CardBody>
                    <Flex direction={{ default: 'column' }} gap={{ default: 'gapMd' }}>
                      <FlexItem>
                        <SerialConsole
                          ns={ns}
                          name={name}
                          running={running}
                          starting={starting}
                          user={user}
                        />
                      </FlexItem>
                      <FlexItem>
                        <BootLog ns={ns} name={name} active={running || starting} />
                      </FlexItem>
                    </Flex>
                  </CardBody>
                </Card>
              </GridItem>
              <GridItem span={12}>
                <ActivityCard ns={ns} name={name} openAtFirst={!running} />
              </GridItem>
              <GridItem span={12}>
                <SnapshotsCard ns={ns} vm={name} running={running} onRestoring={setRestoring} />
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
