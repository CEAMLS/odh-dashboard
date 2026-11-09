// CEAMLS: the virtual machines of one project. A watch, so a state change
// shows without a reload.
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
import VirtualMachinesIcon from '#~/images/icons/VirtualMachinesNavIcon';
import { ProjectDetailsContext } from '#~/pages/projects/ProjectDetailsContext';
import ProjectScopedPage from '#~/pages/ceamls/ProjectScopedPage';
import { createVmRoute, vmRoute, vmsRoute } from '#~/pages/ceamls/routes';
import { ConfirmDeleteModal, Loading } from '#~/pages/ceamls/buckets/common';
import {
  deleteVm,
  errorMessage,
  useSizes,
  useVmis,
  useVms,
  vmAction,
  vmImage,
  vmSize,
  vmSizeName,
  vmState,
} from './api';
import type { Size } from './api';
import type { VirtualMachineInstanceKind, VirtualMachineKind } from './types';
import VmStateLabel from './VmState';

export const vmsTitle = 'Virtual machines';
export const vmsDescription =
  'Linux machines in the project. Open one in the browser console here, or with ceamls vm ssh from your computer, with the SSH keys from your profile. Each machine has its own list of who may SSH in.';

/** The size column: the name, or the numbers of a custom size. */
const sizeText = (vm: VirtualMachineKind, sizes: Size[]): string => {
  const s = vm.spec.instancetype?.name ? undefined : vmSize(vm, sizes);
  return s
    ? `${s.cpu} ${s.cpu === 1 ? 'CPU' : 'CPUs'}, ${s.memory.replace(/Gi$/, ' GiB')}`
    : vmSizeName(vm);
};

const columns: SortableData<VirtualMachineKind>[] = [
  {
    field: 'name',
    label: 'Name',
    sortable: (a, b) => (a.metadata?.name ?? '').localeCompare(b.metadata?.name ?? ''),
  },
  {
    field: 'image',
    label: 'Image',
    sortable: (a, b) => (vmImage(a)?.title ?? '').localeCompare(vmImage(b)?.title ?? ''),
  },
  { field: 'size', label: 'Size', sortable: (a, b) => vmSizeName(a).localeCompare(vmSizeName(b)) },
  {
    field: 'state',
    label: 'State',
    sortable: (a, b) => vmState(a).word.localeCompare(vmState(b).word),
  },
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
  vm: VirtualMachineKind;
  vmi?: VirtualMachineInstanceKind;
  sizes: Size[];
  onDelete: (vm: VirtualMachineKind) => void;
  onError: (message: string) => void;
};

const VmRow: React.FC<RowProps> = ({ ns, vm, vmi, sizes, onDelete, onError }) => {
  const navigate = useNavigate();
  const name = vm.metadata?.name ?? '';
  const state = vmState(vm, vmi);
  const act = (action: 'start' | 'stop' | 'restart') => {
    vmAction(ns, name, action).catch((e: unknown) => onError(errorMessage(e)));
  };
  const items = [
    { title: 'Open', onClick: () => navigate(vmRoute(ns, name)) },
    ...(state.tone === 'off' || state.tone === 'bad'
      ? [{ title: 'Start', onClick: () => act('start') }]
      : []),
    ...(state.tone === 'ok' || state.tone === 'wait'
      ? [
          { title: 'Restart', onClick: () => act('restart'), isDisabled: state.busy },
          { title: 'Stop', onClick: () => act('stop') },
        ]
      : []),
    { isSeparator: true },
    { title: 'Delete', onClick: () => onDelete(vm) },
  ];
  return (
    <Tr>
      <Td dataLabel="Name">
        <Link to={vmRoute(ns, name)}>{name}</Link>
      </Td>
      <Td dataLabel="Image">{vmImage(vm)?.title ?? '—'}</Td>
      <Td dataLabel="Size">{sizeText(vm, sizes) || '—'}</Td>
      <Td dataLabel="State">
        <VmStateLabel state={state} />
      </Td>
      <Td dataLabel="Created">
        {vm.metadata?.creationTimestamp ? (
          <Timestamp date={new Date(vm.metadata.creationTimestamp)} />
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

const VmsPage: React.FC = () => {
  const { currentProject } = React.useContext(ProjectDetailsContext);
  const ns = currentProject.metadata.name;
  const navigate = useNavigate();
  const [vms, loaded, loadError] = useVms(ns);
  const [vmis] = useVmis(ns);
  const [sizes] = useSizes(ns);
  const [toDelete, setToDelete] = React.useState<VirtualMachineKind | undefined>(undefined);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const createHref = createVmRoute(ns);

  let body: React.ReactNode;
  if (loadError) {
    body = (
      <Alert variant="danger" isInline title="The machines could not be listed">
        {loadError.message}
      </Alert>
    );
  } else if (!loaded) {
    body = <Loading />;
  } else if (vms.length === 0) {
    body = (
      <EmptyState
        headingLevel="h2"
        icon={VirtualMachinesIcon}
        titleText="No virtual machines in this project yet"
        variant="lg"
        data-testid="ceamls-vms-empty"
      >
        <EmptyStateBody>
          Make one from an image, with a size and a disk. It runs in the project, with the SSH keys
          from your profile installed, also when you add one later. You decide who else may SSH in.
        </EmptyStateBody>
        <EmptyStateFooter>
          <EmptyStateActions>
            <Button variant="primary" onClick={() => navigate(createHref)}>
              Create virtual machine
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
          data={vms}
          columns={columns}
          data-testid="ceamls-vms-table"
          defaultSortColumn={0}
          toolbarContent={
            <ToolbarItem>
              <Button variant="primary" onClick={() => navigate(createHref)}>
                Create virtual machine
              </Button>
            </ToolbarItem>
          }
          rowRenderer={(vm) => (
            <VmRow
              key={vm.metadata?.uid ?? vm.metadata?.name}
              ns={ns}
              vm={vm}
              vmi={vmis.find((i) => i.metadata?.name === vm.metadata?.name)}
              sizes={sizes}
              onDelete={setToDelete}
              onError={setError}
            />
          )}
        />
      </>
    );
  }

  return (
    <ProjectScopedPage title={vmsTitle} description={vmsDescription} getRedirectPath={vmsRoute}>
      <PageSection hasBodyWrapper={false}>{body}</PageSection>
      {toDelete && (
        <ConfirmDeleteModal
          title="Delete virtual machine?"
          body={
            <>
              This deletes <strong>{toDelete.metadata?.name}</strong>, its disk and its snapshots.
              What is on the disk is lost. Files in a bucket stay.
            </>
          }
          confirmLabel="Delete"
          onConfirm={() => deleteVm(ns, toDelete.metadata?.name ?? '')}
          onClose={() => setToDelete(undefined)}
        />
      )}
    </ProjectScopedPage>
  );
};

export default VmsPage;
