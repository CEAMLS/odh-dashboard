// CEAMLS: one system container: its state, how to connect, the terminal and
// the actions. A trial for administrators.
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
  Flex,
  FlexItem,
  Grid,
  GridItem,
  PageSection,
  Timestamp,
} from '@patternfly/react-core';
import { ApplicationsPage } from '@odh-dashboard/ui-core';
import { ProjectDetailsContext } from '#~/pages/projects/ProjectDetailsContext';
import { containersRoute } from '#~/pages/ceamls/routes';
import { ConfirmDeleteModal, Loading } from '#~/pages/ceamls/buckets/common';
import { errorMessage } from '#~/pages/ceamls/vms/api';
import VmStateLabel from '#~/pages/ceamls/vms/VmState';
import {
  containerAction,
  containerImage,
  containerName,
  containerSize,
  containerState,
  deleteContainer,
  diskOf,
  podOf,
  sizeText,
  sshLine,
  useContainerPods,
  useContainers,
} from './api';
import type { ContainerAction } from './api';
import ShellTerminal from './ShellTerminal';

const ContainerPage: React.FC = () => {
  const { currentProject } = React.useContext(ProjectDetailsContext);
  const ns = currentProject.metadata.name;
  const { name = '' } = useParams();
  const navigate = useNavigate();
  const [machines, loaded] = useContainers(ns);
  const [pods] = useContainerPods(ns);
  const machine = machines.find((m) => containerName(m) === name);
  const pod = podOf(pods, name);
  const state = containerState(machine, pod);
  const running = state.tone === 'ok';
  const [acting, setActing] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [disk, setDisk] = React.useState<string | undefined>(undefined);

  React.useEffect(() => {
    let live = true;
    void diskOf(ns, name).then((d) => {
      if (live) {
        setDisk(d);
      }
    });
    return () => {
      live = false;
    };
  }, [ns, name, machine?.metadata?.uid]);

  const breadcrumb = (
    <Breadcrumb>
      <BreadcrumbItem render={() => <Link to={containersRoute(ns)}>System containers</Link>} />
      <BreadcrumbItem isActive>{name}</BreadcrumbItem>
    </Breadcrumb>
  );

  if (!machine) {
    return (
      <ApplicationsPage title={name} breadcrumb={breadcrumb} loaded={loaded} empty={false}>
        {loaded ? (
          <PageSection hasBodyWrapper={false}>
            <Content component="p">
              No system container with this name.{' '}
              <Link to={containersRoute(ns)}>Back to the list</Link>
            </Content>
          </PageSection>
        ) : (
          <Loading />
        )}
      </ApplicationsPage>
    );
  }

  const image = containerImage(machine);
  const user = image?.user ?? 'ubuntu';
  const act = (action: ContainerAction) => {
    setActing(true);
    setError(undefined);
    containerAction(ns, name, action, pod)
      .catch((e: unknown) => setError(errorMessage(e)))
      .finally(() => setActing(false));
  };

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
          {state.tone === 'off' ? (
            <FlexItem>
              <Button
                variant="primary"
                onClick={() => act('start')}
                isDisabled={acting}
                data-testid="ceamls-sc-start"
              >
                Start
              </Button>
            </FlexItem>
          ) : (
            <>
              <FlexItem>
                <Button
                  variant="secondary"
                  onClick={() => act('restart')}
                  isDisabled={acting || state.busy}
                  data-testid="ceamls-sc-restart"
                >
                  Restart
                </Button>
              </FlexItem>
              <FlexItem>
                <Button
                  variant="secondary"
                  onClick={() => act('stop')}
                  isDisabled={acting}
                  data-testid="ceamls-sc-stop"
                >
                  Stop
                </Button>
              </FlexItem>
            </>
          )}
          <FlexItem>
            <Button
              variant="secondary"
              isDanger
              onClick={() => setConfirmDelete(true)}
              isDisabled={acting}
              data-testid="ceamls-sc-delete"
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
          {state.detail && (
            <FlexItem>
              <Alert
                variant={state.tone === 'bad' ? 'warning' : 'info'}
                isInline
                isPlain={state.tone !== 'bad'}
                title={state.tone === 'bad' ? 'The machine is not running' : state.word}
                data-testid="ceamls-sc-detail"
              >
                {state.detail}
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
                          <code>{user}</code> (with <code>sudo</code>, no password)
                        </DescriptionListDescription>
                      </DescriptionListGroup>
                      <DescriptionListGroup>
                        <DescriptionListTerm>From your computer</DescriptionListTerm>
                        <DescriptionListDescription>
                          <ClipboardCopy isReadOnly hoverTip="Copy" clickTip="Copied" isCode>
                            {sshLine(ns, name, user)}
                          </ClipboardCopy>
                          <Content component="small">
                            Needs <code>oc</code> signed in to the cluster, and your SSH key in your
                            profile. The connection goes through the cluster API. A key you add to
                            your profile reaches the machine within about a minute.
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
                    <DescriptionList isCompact isHorizontal>
                      <DescriptionListGroup>
                        <DescriptionListTerm>Image</DescriptionListTerm>
                        <DescriptionListDescription>
                          {image?.title ?? '—'}
                        </DescriptionListDescription>
                      </DescriptionListGroup>
                      <DescriptionListGroup>
                        <DescriptionListTerm>Size</DescriptionListTerm>
                        <DescriptionListDescription>
                          {sizeText(containerSize(machine))}
                        </DescriptionListDescription>
                      </DescriptionListGroup>
                      <DescriptionListGroup>
                        <DescriptionListTerm>Disk</DescriptionListTerm>
                        <DescriptionListDescription>
                          {disk ? disk.replace(/Gi$/, ' GiB') : '—'}
                        </DescriptionListDescription>
                      </DescriptionListGroup>
                      <DescriptionListGroup>
                        <DescriptionListTerm>Node</DescriptionListTerm>
                        <DescriptionListDescription>
                          {pod?.spec?.nodeName ?? '—'}
                        </DescriptionListDescription>
                      </DescriptionListGroup>
                      <DescriptionListGroup>
                        <DescriptionListTerm>Created</DescriptionListTerm>
                        <DescriptionListDescription>
                          {machine.metadata?.creationTimestamp ? (
                            <Timestamp date={new Date(machine.metadata.creationTimestamp)} />
                          ) : (
                            '—'
                          )}
                        </DescriptionListDescription>
                      </DescriptionListGroup>
                    </DescriptionList>
                  </CardBody>
                </Card>
              </GridItem>
            </Grid>
          </FlexItem>
          <FlexItem>
            <Card>
              <CardTitle>Terminal</CardTitle>
              <CardBody>
                <ShellTerminal
                  ns={ns}
                  pod={running ? pod?.metadata?.name : undefined}
                  running={running}
                  starting={state.tone === 'wait'}
                  user={user}
                />
              </CardBody>
            </Card>
          </FlexItem>
          <FlexItem>
            <Content component="small">
              This machine shares the kernel of its node. It cannot load kernel modules, and tools
              such as <code>nproc</code> and <code>free</code> show the whole node, not the size
              above.
            </Content>
          </FlexItem>
        </Flex>
      </PageSection>
      {confirmDelete && (
        <ConfirmDeleteModal
          title="Delete system container?"
          body={
            <>
              This deletes <strong>{name}</strong> and its disk. What is on the disk is lost. Files
              in a bucket stay.
            </>
          }
          confirmLabel="Delete"
          onConfirm={() => deleteContainer(ns, name).then(() => navigate(containersRoute(ns)))}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </ApplicationsPage>
  );
};

export default ContainerPage;
