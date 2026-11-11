// CEAMLS: the Secrets and variables page of one project: the project
// environment as one flat list. A secret hides its value; a variable shows
// it. Plan: planning/hub_pages.md section 3.6 in the cluster repo.
import * as React from 'react';
import {
  Alert,
  Button,
  ClipboardCopy,
  ClipboardCopyVariant,
  Content,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Label,
  PageSection,
  Spinner,
  Timestamp,
  ToolbarItem,
  Tooltip,
} from '@patternfly/react-core';
import { ActionsColumn, Td, Tr } from '@patternfly/react-table';
import { KeyIcon } from '@patternfly/react-icons/dist/esm/icons/key-icon';
import { LockIcon } from '@patternfly/react-icons/dist/esm/icons/lock-icon';
import { Table } from '@odh-dashboard/ui-core';
import type { SortableData } from '@odh-dashboard/ui-core';
import { ProjectDetailsContext } from '#~/pages/projects/ProjectDetailsContext';
import ProjectScopedPage from '#~/pages/ceamls/ProjectScopedPage';
import { envRoute } from '#~/pages/ceamls/routes';
import { useUser } from '#~/redux/selectors';
import { ConfirmDeleteModal } from '#~/pages/ceamls/buckets/common';
import { loadersText, removeVariable, useLoaders, useProjectEnv } from './api';
import type { EnvVar } from './envUtils';
import { AddVariableModal } from './AddVariableModal';

export const envTitle = 'Secrets and variables';
export const envDescription =
  'The environment variables of the project. A secret hides its value; a variable shows it. Every workbench and VM that uses the project environment gets all of them at its next restart. Every member of the project can read every value. A set of values for one outside system that only some things use is a connection: see Connections.';

const columns: SortableData<EnvVar>[] = [
  { field: 'name', label: 'Name', sortable: (a, b) => a.name.localeCompare(b.name) },
  { field: 'value', label: 'Value', sortable: false },
  {
    field: 'secret',
    label: 'Type',
    sortable: (a, b) => Number(a.secret) - Number(b.secret),
  },
  {
    field: 'at',
    label: 'Changed',
    sortable: (a, b) => (a.at ?? '').localeCompare(b.at ?? ''),
  },
  { field: 'actions', label: '', sortable: false },
];

const HIDDEN = '••••••••••••';

const ValueCell: React.FC<{ v: EnvVar }> = ({ v }) => {
  const [shown, setShown] = React.useState(false);
  if (v.secret && !shown) {
    return (
      <>
        <span aria-label="Hidden value" className="pf-v6-u-mr-sm">
          {HIDDEN}
        </span>
        <Button variant="link" isInline onClick={() => setShown(true)}>
          Show
        </Button>
      </>
    );
  }
  return (
    <>
      <ClipboardCopy
        isReadOnly
        hoverTip="Copy"
        clickTip="Copied"
        variant={ClipboardCopyVariant.inlineCompact}
        isCode
      >
        {v.value}
      </ClipboardCopy>
      {v.secret && (
        <Button variant="link" isInline className="pf-v6-u-ml-sm" onClick={() => setShown(false)}>
          Hide
        </Button>
      )}
    </>
  );
};

type RowProps = { v: EnvVar; onEdit: (v: EnvVar) => void; onRemove: (v: EnvVar) => void };

const Row: React.FC<RowProps> = ({ v, onEdit, onRemove }) => (
  <Tr data-testid={`ceamls-env-row-${v.name}`}>
    <Td dataLabel="Name">
      <code>{v.name}</code>
    </Td>
    <Td dataLabel="Value" modifier="breakWord">
      <ValueCell v={v} />
    </Td>
    <Td dataLabel="Type">
      {v.secret ? (
        <Label isCompact icon={<LockIcon />}>
          Secret
        </Label>
      ) : (
        <Label isCompact color="blue">
          Variable
        </Label>
      )}
    </Td>
    <Td dataLabel="Changed">
      {v.at ? (
        <Tooltip content={v.by ? `By ${v.by}` : 'By someone outside the page'}>
          <span>
            <Timestamp date={new Date(v.at)} />
          </span>
        </Tooltip>
      ) : (
        <span className="pf-v6-u-color-200">Made outside the page</span>
      )}
    </Td>
    <Td isActionCell>
      <ActionsColumn
        items={[
          { title: 'Edit', onClick: () => onEdit(v) },
          { isSeparator: true },
          { title: 'Remove', onClick: () => onRemove(v), isDanger: true },
        ]}
      />
    </Td>
  </Tr>
);

const EnvPage: React.FC = () => {
  const { currentProject } = React.useContext(ProjectDetailsContext);
  const ns = currentProject.metadata.name;
  const { username } = useUser();
  const { vars, loaded, error } = useProjectEnv(ns);
  const loaders = useLoaders(ns);
  const [adding, setAdding] = React.useState<'one' | 'many' | undefined>(undefined);
  const [editing, setEditing] = React.useState<EnvVar | undefined>(undefined);
  const [removing, setRemoving] = React.useState<EnvVar | undefined>(undefined);

  const addButton = (
    <Button variant="primary" onClick={() => setAdding('one')} data-testid="ceamls-env-add">
      Add variable
    </Button>
  );
  const addManyButton = (
    <Button variant="secondary" onClick={() => setAdding('many')} data-testid="ceamls-env-add-many">
      Add several
    </Button>
  );

  let body: React.ReactNode;
  if (!loaded) {
    body = (
      <div className="pf-v6-u-text-align-center pf-v6-u-p-xl">
        <Spinner aria-label="Loading the project environment" />
      </div>
    );
  } else if (vars.length === 0) {
    body = (
      <EmptyState headingLevel="h2" icon={KeyIcon} titleText="No secrets or variables yet">
        <EmptyStateBody>
          Add a token, a password, a host or a path once here, and every workbench and VM of the
          project that uses the project environment gets it. Your code reads it like any environment
          variable.
        </EmptyStateBody>
        <EmptyStateFooter>
          <EmptyStateActions>
            {addButton}
            {addManyButton}
          </EmptyStateActions>
        </EmptyStateFooter>
      </EmptyState>
    );
  } else {
    body = (
      <>
        <Table
          data={vars}
          columns={columns}
          variant="compact"
          data-testid="ceamls-env-table"
          toolbarContent={
            <>
              <ToolbarItem>{addButton}</ToolbarItem>
              <ToolbarItem>{addManyButton}</ToolbarItem>
            </>
          }
          rowRenderer={(v) => <Row key={v.name} v={v} onEdit={setEditing} onRemove={setRemoving} />}
        />
        <Content component="p" className="pf-v6-u-mt-md" data-testid="ceamls-env-loaders">
          {vars.length} {vars.length === 1 ? 'variable' : 'variables'}.{' '}
          {loaders.loaded
            ? `Loaded by ${loadersText(
                loaders,
              )} of this project. They see a new or changed value after a restart.`
            : ''}{' '}
          On your computer: <code>eval &quot;$(ceamls env)&quot;</code>.
        </Content>
      </>
    );
  }

  return (
    <ProjectScopedPage title={envTitle} description={envDescription} getRedirectPath={envRoute}>
      <PageSection hasBodyWrapper={false}>
        {error && (
          <Alert variant="danger" isInline title="The project environment cannot be read">
            {error.message}
          </Alert>
        )}
        {body}
      </PageSection>
      {(adding || editing) && (
        <AddVariableModal
          ns={ns}
          by={username}
          existing={vars}
          mode={editing ? 'one' : adding ?? 'one'}
          edit={editing}
          onClose={() => {
            setAdding(undefined);
            setEditing(undefined);
          }}
        />
      )}
      {removing && (
        <ConfirmDeleteModal
          title={`Remove ${removing.secret ? 'secret' : 'variable'} ${removing.name}?`}
          body={
            <>
              {removing.secret
                ? 'Nobody can read its value again. '
                : 'The value is gone from the project. '}
              {loaders.loaded
                ? `${loadersText(loaders)} lose it at their next restart.`
                : 'Workbenches and VMs lose it at their next restart.'}
            </>
          }
          confirmLabel="Remove"
          onConfirm={() => removeVariable(ns, removing, username)}
          onClose={() => setRemoving(undefined)}
        />
      )}
    </ProjectScopedPage>
  );
};

export default EnvPage;
