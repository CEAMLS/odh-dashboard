// CEAMLS: the system containers of one project. A watch, so a state change
// shows without a reload. A trial for administrators.
import * as React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  PageSection,
  Timestamp,
  ToolbarItem,
} from '@patternfly/react-core';
import { ActionsColumn, Td, Tr } from '@patternfly/react-table';
import { Table } from '@odh-dashboard/ui-core';
import type { SortableData } from '@odh-dashboard/ui-core';
import SystemContainersIcon from '#~/images/icons/SystemContainersNavIcon';
import { ProjectDetailsContext } from '#~/pages/projects/ProjectDetailsContext';
import ProjectScopedPage from '#~/pages/ceamls/ProjectScopedPage';
import { containerRoute, containersRoute, createContainerRoute } from '#~/pages/ceamls/routes';
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
  podOf,
  sizeText,
  useContainerPods,
  useContainers,
} from './api';
import type { DeploymentKind, PodKind } from './types';

export const containersTitle = 'System containers';
export const containersDescription =
  'A trial, for administrators only. A system container is a Linux machine that starts in seconds: root, systemd, SSH and a disk that stays. It shares the kernel of its node, so it takes shares of a GPU like a workbench does, with no GPU set apart for it.';

const columns: SortableData<DeploymentKind>[] = [
  {
    field: 'name',
    label: 'Name',
    sortable: (a, b) => containerName(a).localeCompare(containerName(b)),
  },
  { field: 'image', label: 'Image', sortable: false },
  { field: 'size', label: 'Size', sortable: false },
  { field: 'state', label: 'State', sortable: false },
  {
    field: 'created',
    label: 'Created',
    sortable: (a, b) =>
      (a.metadata?.creationTimestamp ?? '').localeCompare(b.metadata?.creationTimestamp ?? ''),
  },
  { field: 'actions', label: '', sortable: false },
];

type RowProps = {
  ns: string;
  machine: DeploymentKind;
  pod?: PodKind;
  onDelete: (d: DeploymentKind) => void;
  onError: (message: string) => void;
};

const ContainerRow: React.FC<RowProps> = ({ ns, machine, pod, onDelete, onError }) => {
  const navigate = useNavigate();
  const name = containerName(machine);
  const state = containerState(machine, pod);
  const act = (action: 'start' | 'stop' | 'restart') => {
    containerAction(ns, name, action, pod).catch((e: unknown) => onError(errorMessage(e)));
  };
  const items = [
    { title: 'Open', onClick: () => navigate(containerRoute(ns, name)) },
    ...(state.tone === 'off' ? [{ title: 'Start', onClick: () => act('start') }] : []),
    ...(state.tone !== 'off'
      ? [
          { title: 'Restart', onClick: () => act('restart'), isDisabled: state.busy },
          { title: 'Stop', onClick: () => act('stop') },
        ]
      : []),
    { isSeparator: true },
    { title: 'Delete', onClick: () => onDelete(machine) },
  ];
  return (
    <Tr>
      <Td dataLabel="Name">
        <Link to={containerRoute(ns, name)}>{name}</Link>
      </Td>
      <Td dataLabel="Image">{containerImage(machine)?.title ?? '—'}</Td>
      <Td dataLabel="Size">{sizeText(containerSize(machine))}</Td>
      <Td dataLabel="State">
        <VmStateLabel state={state} />
      </Td>
      <Td dataLabel="Created">
        {machine.metadata?.creationTimestamp ? (
          <Timestamp date={new Date(machine.metadata.creationTimestamp)} />
        ) : (
          '—'
        )}
      </Td>
      <Td isActionCell>
        <ActionsColumn items={items} />
      </Td>
    </Tr>
  );
};

const ContainersPage: React.FC = () => {
  const { currentProject } = React.useContext(ProjectDetailsContext);
  const ns = currentProject.metadata.name;
  const navigate = useNavigate();
  const [machines, loaded, loadError] = useContainers(ns);
  const [pods] = useContainerPods(ns);
  const [toDelete, setToDelete] = React.useState<DeploymentKind | undefined>(undefined);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const createHref = createContainerRoute(ns);

  let body: React.ReactNode;
  if (loadError) {
    body = (
      <Alert variant="danger" isInline title="The machines could not be listed">
        {loadError.message}
      </Alert>
    );
  } else if (!loaded) {
    body = <Loading />;
  } else if (machines.length === 0) {
    body = (
      <EmptyState
        headingLevel="h2"
        icon={SystemContainersIcon}
        titleText="No system containers in this project yet"
        variant="lg"
        data-testid="ceamls-sc-empty"
      >
        <EmptyStateBody>
          Make one from an image, with CPUs, memory, a disk and GPU shares. It is ready in about 20
          seconds, and what you install in it stays over a stop and a start.
        </EmptyStateBody>
        <EmptyStateFooter>
          <EmptyStateActions>
            <Button variant="primary" onClick={() => navigate(createHref)}>
              Create system container
            </Button>
          </EmptyStateActions>
        </EmptyStateFooter>
      </EmptyState>
    );
  } else {
    body = (
      <>
        {error && (
          <Alert
            variant="danger"
            isInline
            title="The request failed"
            className="pf-v6-u-mb-md"
            actionClose={
              <Button variant="plain" aria-label="Dismiss" onClick={() => setError(undefined)} />
            }
          >
            {error}
          </Alert>
        )}
        <Table
          data={machines}
          columns={columns}
          data-testid="ceamls-sc-table"
          defaultSortColumn={0}
          toolbarContent={
            <ToolbarItem>
              <Button variant="primary" onClick={() => navigate(createHref)}>
                Create system container
              </Button>
            </ToolbarItem>
          }
          rowRenderer={(machine) => (
            <ContainerRow
              key={machine.metadata?.uid ?? machine.metadata?.name}
              ns={ns}
              machine={machine}
              pod={podOf(pods, containerName(machine))}
              onDelete={setToDelete}
              onError={setError}
            />
          )}
        />
      </>
    );
  }

  return (
    <ProjectScopedPage
      title={containersTitle}
      description={containersDescription}
      getRedirectPath={containersRoute}
    >
      <PageSection hasBodyWrapper={false}>{body}</PageSection>
      {toDelete && (
        <ConfirmDeleteModal
          title="Delete system container?"
          body={
            <>
              This deletes <strong>{containerName(toDelete)}</strong> and its disk. What is on the
              disk is lost. Files in a bucket stay.
            </>
          }
          confirmLabel="Delete"
          onConfirm={() => deleteContainer(ns, containerName(toDelete))}
          onClose={() => setToDelete(undefined)}
        />
      )}
    </ProjectScopedPage>
  );
};

export default ContainersPage;
