// CEAMLS: one bucket: the objects under a prefix, upload, download, delete.
import * as React from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Breadcrumb,
  BreadcrumbItem,
  Button,
  Dropdown,
  DropdownItem,
  DropdownList,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  MenuToggle,
  Progress,
  ProgressMeasureLocation,
  SearchInput,
  TextInput,
  Timestamp,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core';
import { ActionsColumn, Td, Tr } from '@patternfly/react-table';
import {
  DatabaseIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
  SyncAltIcon,
  UploadIcon,
} from '@patternfly/react-icons';
import { ApplicationsPage, ContentModal, Table } from '@odh-dashboard/ui-core';
import type { SortableData } from '@odh-dashboard/ui-core';
import { bucketsRoute } from '#~/pages/ceamls/routes';
import {
  deleteObject,
  deletePrefix,
  listObjects,
  objectUrl,
  toApiError,
  uploadObject,
} from './api';
import type { ApiError, S3Object } from './api';
import { ApiErrorState, ConfirmDeleteModal, InlineError, Loading } from './common';
import { DeleteBucketModal } from './DeleteBucketModal';
import { baseName, formatBytes, prefixCrumbs } from './format';

type Entry = { key: string; name: string; folder: boolean; size?: number; modified?: string };

// Folders first, then by name.
const byName = (a: Entry, b: Entry): number =>
  a.folder === b.folder ? a.name.localeCompare(b.name) : a.folder ? -1 : 1;

const columns: SortableData<Entry>[] = [
  { field: 'name', label: 'Name', sortable: byName },
  { field: 'size', label: 'Size', sortable: (a, b) => (a.size ?? -1) - (b.size ?? -1) },
  {
    field: 'modified',
    label: 'Last modified',
    sortable: (a, b) => (a.modified ?? '').localeCompare(b.modified ?? ''),
  },
  { field: 'actions', label: '', sortable: false },
];

type RowProps = {
  ns: string;
  bucket: string;
  entry: Entry;
  openFolder: (prefix: string) => void;
  remove: (entry: Entry) => void;
};

const EntryRow: React.FC<RowProps> = ({ ns, bucket, entry, openFolder, remove }) => {
  const download = () => window.location.assign(objectUrl(ns, bucket, entry.key));
  return (
    <Tr>
      <Td dataLabel="Name">
        {entry.folder ? (
          <FolderIcon className="pf-v6-u-mr-sm" />
        ) : (
          <FileIcon className="pf-v6-u-mr-sm" />
        )}
        {entry.folder ? (
          <Button variant="link" isInline onClick={() => openFolder(entry.key)}>
            {entry.name}
          </Button>
        ) : (
          entry.name
        )}
      </Td>
      <Td dataLabel="Size">{entry.folder ? '-' : formatBytes(entry.size)}</Td>
      <Td dataLabel="Last modified">
        {!entry.folder && entry.modified ? <Timestamp date={new Date(entry.modified)} /> : '-'}
      </Td>
      <Td isActionCell>
        <ActionsColumn
          items={
            entry.folder
              ? [
                  { title: 'Open', onClick: () => openFolder(entry.key) },
                  { isSeparator: true },
                  { title: 'Delete folder', onClick: () => remove(entry), isDanger: true },
                ]
              : [
                  { title: 'Download', onClick: download },
                  { isSeparator: true },
                  { title: 'Delete', onClick: () => remove(entry), isDanger: true },
                ]
          }
        />
      </Td>
    </Tr>
  );
};

type NewFolderProps = { prefix: string; onCreate: (prefix: string) => void; onClose: () => void };

const NewFolderModal: React.FC<NewFolderProps> = ({ prefix, onCreate, onClose }) => {
  const [name, setName] = React.useState('');
  const bad = name.includes('/') || name === '.' || name === '..';
  const ready = !!name.trim() && !bad;
  const submit = () => {
    if (!ready) {
      return;
    }
    onClose();
    onCreate(`${prefix}${name.trim()}/`);
  };
  return (
    <ContentModal
      variant="small"
      title="New folder"
      description="An S3 folder is a name prefix. It exists once a file is uploaded into it."
      onClose={onClose}
      dataTestId="ceamls-new-folder"
      buttonActions={[
        { label: 'Create', onClick: submit, variant: 'primary', isDisabled: !ready },
        { label: 'Cancel', onClick: onClose, variant: 'link' },
      ]}
      contents={
        <Form
          id="ceamls-new-folder-form"
          onSubmit={(ev) => {
            ev.preventDefault();
            submit();
          }}
        >
          <FormGroup label="Name" isRequired fieldId="ceamls-folder-name">
            <TextInput
              id="ceamls-folder-name"
              value={name}
              onChange={(_e, v) => setName(v)}
              validated={bad ? 'error' : 'default'}
              autoFocus
              isRequired
            />
            {bad && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="error">A folder name has no slash.</HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>
        </Form>
      }
    />
  );
};

type UploadState = {
  total: number;
  done: number;
  current: string;
  loaded: number;
  size: number;
  errors: string[];
  skipped: number;
  finished: boolean;
};

const uploadTitle = (u: UploadState): string => {
  if (!u.finished) {
    return `Uploading ${u.done + 1} of ${u.total}: ${u.current}`;
  }
  if (u.errors.length) {
    return `${u.errors.length} of ${u.total} files failed`;
  }
  const n = u.total - u.skipped;
  return n === 1 ? '1 file uploaded' : `${n} files uploaded`;
};

const uploadVariant = (u: UploadState): 'info' | 'danger' | 'success' => {
  if (!u.finished) {
    return 'info';
  }
  return u.errors.length ? 'danger' : 'success';
};

type Dialog =
  | { kind: 'folder' }
  | { kind: 'delete-bucket' }
  | { kind: 'delete-entry'; entry: Entry }
  | undefined;

const ObjectsPage: React.FC = () => {
  const { namespace: ns = '', bucket = '' } = useParams<{ namespace: string; bucket: string }>();
  const [search, setSearch] = useSearchParams();
  const prefix = search.get('prefix') ?? '';
  const navigate = useNavigate();

  const [objects, setObjects] = React.useState<S3Object[]>([]);
  const [prefixes, setPrefixes] = React.useState<string[]>([]);
  const [next, setNext] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [more, setMore] = React.useState(false);
  const [error, setError] = React.useState<ApiError | undefined>(undefined);
  const [filter, setFilter] = React.useState('');
  const [upload, setUpload] = React.useState<UploadState | undefined>(undefined);
  const [dialog, setDialog] = React.useState<Dialog>(undefined);
  const [actionsOpen, setActionsOpen] = React.useState(false);
  const abort = React.useRef<AbortController | undefined>(undefined);
  const filesInput = React.useRef<HTMLInputElement>(null);
  const folderInput = React.useRef<HTMLInputElement>(null);

  const load = React.useCallback(
    async (token?: string | null) => {
      if (token) {
        setMore(true);
      } else {
        setLoading(true);
      }
      try {
        const page = await listObjects(ns, bucket, prefix, token);
        setObjects((old) => (token ? [...old, ...page.objects] : page.objects));
        setPrefixes((old) => (token ? [...old, ...page.prefixes] : page.prefixes));
        setNext(page.next);
        setError(undefined);
      } catch (e) {
        setError(toApiError(e));
      } finally {
        setLoading(false);
        setMore(false);
      }
    },
    [ns, bucket, prefix],
  );

  React.useEffect(() => {
    void load();
  }, [load]);

  // The folder picker: an attribute React's types do not know.
  React.useEffect(() => {
    folderInput.current?.setAttribute('webkitdirectory', '');
  }, []);

  const openFolder = React.useCallback(
    (p: string) => {
      setFilter('');
      setSearch(p ? { prefix: p } : {});
    },
    [setSearch],
  );

  // A finished upload report belongs to the folder it ran in.
  React.useEffect(() => {
    setUpload((u) => (u && u.finished ? undefined : u));
  }, [prefix]);

  const entries: Entry[] = React.useMemo(() => {
    const folders: Entry[] = prefixes.map((p) => ({ key: p, name: baseName(p), folder: true }));
    const files: Entry[] = objects
      .filter((o) => o.key !== prefix && !o.key.endsWith('/'))
      .map((o) => ({
        key: o.key,
        name: o.key.slice(prefix.length),
        folder: false,
        size: o.size,
        modified: o.modified,
      }));
    const all = [...folders, ...files];
    if (!filter) {
      return all;
    }
    const f = filter.toLowerCase();
    return all.filter((e) => e.name.toLowerCase().includes(f));
  }, [prefixes, objects, prefix, filter]);

  const uploadFiles = async (files: File[], relative: boolean) => {
    if (!files.length) {
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    const state: UploadState = {
      total: files.length,
      done: 0,
      current: '',
      loaded: 0,
      size: 0,
      errors: [],
      skipped: 0,
      finished: false,
    };
    setUpload({ ...state });
    for (const file of files) {
      if (controller.signal.aborted) {
        break;
      }
      const rel = relative && file.webkitRelativePath ? file.webkitRelativePath : file.name;
      const key = prefix + rel;
      state.current = rel;
      state.loaded = 0;
      state.size = file.size;
      setUpload({ ...state });
      if (file.size === 0) {
        state.skipped += 1;
        state.done += 1;
        // eslint-disable-next-line no-continue
        continue;
      }
      try {
        // eslint-disable-next-line no-await-in-loop
        await uploadObject(
          ns,
          bucket,
          key,
          file,
          (loaded, total) => {
            state.loaded = loaded;
            state.size = total;
            setUpload({ ...state });
          },
          controller.signal,
        );
      } catch (e) {
        state.errors.push(`${rel}: ${toApiError(e).message}`);
      }
      state.done += 1;
      setUpload({ ...state });
    }
    state.finished = true;
    setUpload({ ...state });
    abort.current = undefined;
    void load();
  };

  const onPick = (relative: boolean) => (ev: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(ev.target.files ?? []);
    // eslint-disable-next-line no-param-reassign
    ev.target.value = '';
    void uploadFiles(files, relative);
  };

  const crumbs = prefixCrumbs(prefix);
  const title = crumbs.length ? crumbs[crumbs.length - 1][0] : bucket;
  const uploading = !!upload && !upload.finished;
  const empty = !loading && !error && entries.length === 0;

  let emptyTitle = 'No objects';
  let emptyBody = 'Upload files or a folder, or write to the bucket from a workbench.';
  if (filter) {
    emptyTitle = 'No match';
    emptyBody = `No object name contains "${filter}".`;
  } else if (prefix) {
    emptyTitle = 'This folder is empty';
    emptyBody = 'Upload a file here to create the folder in the bucket.';
  }

  const breadcrumb = (
    <Breadcrumb>
      <BreadcrumbItem render={() => <Link to={bucketsRoute(ns)}>Buckets</Link>} />
      {prefix ? (
        <BreadcrumbItem
          render={() => (
            <Button variant="link" isInline onClick={() => openFolder('')}>
              {bucket}
            </Button>
          )}
        />
      ) : (
        <BreadcrumbItem isActive>{bucket}</BreadcrumbItem>
      )}
      {crumbs.map(([name, p], i) =>
        i === crumbs.length - 1 ? (
          <BreadcrumbItem key={p} isActive>
            {name}
          </BreadcrumbItem>
        ) : (
          <BreadcrumbItem
            key={p}
            render={() => (
              <Button variant="link" isInline onClick={() => openFolder(p)}>
                {name}
              </Button>
            )}
          />
        ),
      )}
    </Breadcrumb>
  );

  // Delete bucket takes the objects with it; the dialog asks for the
  // bucket name and shows progress.
  const actions = (
    <Dropdown
      isOpen={actionsOpen}
      onOpenChange={setActionsOpen}
      onSelect={() => setActionsOpen(false)}
      popperProps={{ position: 'right' }}
      toggle={(ref) => (
        <MenuToggle ref={ref} onClick={() => setActionsOpen((v) => !v)} isExpanded={actionsOpen}>
          Actions
        </MenuToggle>
      )}
    >
      <DropdownList>
        <DropdownItem isDanger onClick={() => setDialog({ kind: 'delete-bucket' })}>
          Delete bucket
        </DropdownItem>
      </DropdownList>
    </Dropdown>
  );

  const toolbar = (
    <>
      <ToolbarItem>
        <SearchInput
          placeholder="Filter by name"
          value={filter}
          onChange={(_e, v) => setFilter(v)}
          onClear={() => setFilter('')}
          aria-label="Filter by name"
        />
      </ToolbarItem>
      <ToolbarGroup variant="action-group-plain" align={{ default: 'alignEnd' }}>
        <ToolbarItem>
          <Button
            variant="primary"
            icon={<UploadIcon />}
            onClick={() => filesInput.current?.click()}
            isDisabled={uploading}
          >
            Upload files
          </Button>
        </ToolbarItem>
        <ToolbarItem>
          <Button
            variant="secondary"
            onClick={() => folderInput.current?.click()}
            isDisabled={uploading}
          >
            Upload folder
          </Button>
        </ToolbarItem>
        <ToolbarItem>
          <Button variant="secondary" onClick={() => setDialog({ kind: 'folder' })}>
            New folder
          </Button>
        </ToolbarItem>
        <ToolbarItem>
          <Button
            variant="plain"
            aria-label="Refresh"
            icon={<SyncAltIcon />}
            onClick={() => void load()}
          />
        </ToolbarItem>
      </ToolbarGroup>
    </>
  );

  let body: React.ReactNode;
  if (error && !objects.length) {
    body = <ApiErrorState error={error} ns={ns} />;
  } else if (loading && !objects.length && !prefixes.length) {
    body = <Loading />;
  } else if (empty) {
    body = (
      <EmptyState
        headingLevel="h2"
        icon={prefix ? FolderOpenIcon : DatabaseIcon}
        titleText={emptyTitle}
      >
        <EmptyStateBody>{emptyBody}</EmptyStateBody>
        {!filter && (
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button
                variant="primary"
                icon={<UploadIcon />}
                onClick={() => filesInput.current?.click()}
              >
                Upload files
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        )}
      </EmptyState>
    );
  } else {
    body = (
      <Table
        data={entries}
        columns={columns}
        variant="compact"
        data-testid="ceamls-objects-table"
        rowRenderer={(entry) => (
          <EntryRow
            key={entry.key}
            ns={ns}
            bucket={bucket}
            entry={entry}
            openFolder={openFolder}
            remove={(e) => setDialog({ kind: 'delete-entry', entry: e })}
          />
        )}
      />
    );
  }

  return (
    <ApplicationsPage
      title={title}
      breadcrumb={breadcrumb}
      headerAction={actions}
      loaded
      empty={false}
      provideChildrenPadding
    >
      <input ref={filesInput} type="file" multiple hidden onChange={onPick(false)} />
      <input ref={folderInput} type="file" hidden onChange={onPick(true)} />
      {upload && (
        <Alert
          variant={uploadVariant(upload)}
          isInline
          className="pf-v6-u-mb-md"
          title={uploadTitle(upload)}
          actionClose={
            upload.finished ? undefined : (
              <Button variant="link" onClick={() => abort.current?.abort()}>
                Cancel
              </Button>
            )
          }
          actionLinks={
            upload.finished ? (
              <Button variant="link" isInline onClick={() => setUpload(undefined)}>
                Dismiss
              </Button>
            ) : undefined
          }
        >
          {!upload.finished && (
            <Progress
              value={upload.size ? (upload.loaded / upload.size) * 100 : 0}
              measureLocation={ProgressMeasureLocation.outside}
              label={`${formatBytes(upload.loaded)} / ${formatBytes(upload.size)}`}
              aria-label="Upload progress"
              size="sm"
            />
          )}
          {upload.skipped > 0 && <p>{`${upload.skipped} empty files were skipped.`}</p>}
          {upload.errors.length > 0 && (
            <ul>
              {upload.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </Alert>
      )}
      {!(error && !objects.length) && <InlineError error={error} />}
      {/* The toolbar sits above the body also when the body is not a table. */}
      <Toolbar data-testid="ceamls-objects-toolbar" clearAllFilters={() => setFilter('')}>
        <ToolbarContent>{toolbar}</ToolbarContent>
      </Toolbar>
      {body}
      {next && (
        <div className="pf-v6-u-text-align-center pf-v6-u-mt-md">
          <Button
            variant="secondary"
            onClick={() => void load(next)}
            isLoading={more}
            isDisabled={more}
          >
            Load more
          </Button>
        </div>
      )}
      {dialog?.kind === 'folder' && (
        <NewFolderModal
          prefix={prefix}
          onCreate={openFolder}
          onClose={() => setDialog(undefined)}
        />
      )}
      {dialog?.kind === 'delete-bucket' && (
        <DeleteBucketModal
          ns={ns}
          bucket={bucket}
          onDone={() => navigate(bucketsRoute(ns))}
          onClose={() => setDialog(undefined)}
        />
      )}
      {dialog?.kind === 'delete-entry' && (
        <ConfirmDeleteModal
          title={dialog.entry.folder ? 'Delete folder?' : 'Delete object?'}
          body={
            dialog.entry.folder
              ? `Every object under ${dialog.entry.key} is deleted. This cannot be undone.`
              : `The object ${dialog.entry.key} is deleted. This cannot be undone.`
          }
          confirmLabel="Delete"
          onConfirm={() =>
            dialog.entry.folder
              ? deletePrefix(ns, bucket, dialog.entry.key)
              : deleteObject(ns, bucket, dialog.entry.key)
          }
          onDone={() => void load()}
          onClose={() => setDialog(undefined)}
        />
      )}
    </ApplicationsPage>
  );
};

export default ObjectsPage;
