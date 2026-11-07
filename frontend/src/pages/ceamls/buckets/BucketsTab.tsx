// CEAMLS: the list of a project's buckets.
import * as React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Label,
  Timestamp,
  ToolbarItem,
} from '@patternfly/react-core';
import { ActionsColumn, Td, Tr } from '@patternfly/react-table';
import { DatabaseIcon } from '@patternfly/react-icons';
import { Table } from '@odh-dashboard/ui-core';
import type { SortableData } from '@odh-dashboard/ui-core';
import { bucketRoute } from '#~/pages/ceamls/routes';
import { listBuckets } from './api';
import type { Bucket } from './api';
import { ApiErrorState, InlineError, Loading, useApi } from './common';
import { CreateBucketModal } from './CreateBucketModal';
import { DeleteBucketModal } from './DeleteBucketModal';
import { formatBytes, formatCount } from './format';

const columns: SortableData<Bucket>[] = [
  { field: 'name', label: 'Name', sortable: (a, b) => a.name.localeCompare(b.name) },
  {
    field: 'objects',
    label: 'Objects',
    sortable: (a, b) => (a.usage?.objects ?? 0) - (b.usage?.objects ?? 0),
  },
  {
    field: 'size',
    label: 'Size',
    sortable: (a, b) => (a.usage?.bytes ?? 0) - (b.usage?.bytes ?? 0),
  },
  {
    field: 'created',
    label: 'Created',
    sortable: (a, b) => (a.created ?? '').localeCompare(b.created ?? ''),
  },
  { field: 'actions', label: '', sortable: false },
];

type RowProps = {
  ns: string;
  bucket: Bucket;
  isDefault: boolean;
  onDelete: (bucket: Bucket) => void;
};

const BucketRow: React.FC<RowProps> = ({ ns, bucket, isDefault, onDelete }) => {
  const navigate = useNavigate();
  const href = bucketRoute(ns, bucket.name);
  return (
    <Tr>
      <Td dataLabel="Name">
        <DatabaseIcon className="pf-v6-u-mr-sm" />
        <Link to={href}>{bucket.name}</Link>
        {isDefault && (
          <Label isCompact color="blue" className="pf-v6-u-ml-sm">
            Default
          </Label>
        )}
      </Td>
      <Td dataLabel="Objects">
        {formatCount(bucket.usage?.objects, bucket.usage?.complete ?? true)}
      </Td>
      <Td dataLabel="Size">{formatBytes(bucket.usage?.bytes)}</Td>
      <Td dataLabel="Created">
        {bucket.created ? <Timestamp date={new Date(bucket.created)} /> : '-'}
      </Td>
      <Td isActionCell>
        <ActionsColumn
          items={[
            { title: 'Browse objects', onClick: () => navigate(href) },
            { isSeparator: true },
            { title: 'Delete bucket', onClick: () => onDelete(bucket), isDanger: true },
          ]}
        />
      </Td>
    </Tr>
  );
};

export const BucketsTab: React.FC<{ ns: string }> = ({ ns }) => {
  const { data, error, loading, reload: reloadNow } = useApi(() => listBuckets(ns), [ns]);
  const [creating, setCreating] = React.useState(false);
  const [deleting, setDeleting] = React.useState<Bucket | undefined>(undefined);
  // The object store has several gateway pods. The one that lists the
  // buckets can lag the one that made or deleted a bucket by a moment, so
  // the list is read again two seconds later.
  const reload = React.useCallback(() => {
    reloadNow();
    window.setTimeout(reloadNow, 2000);
  }, [reloadNow]);
  if (loading && !data) {
    return <Loading />;
  }
  if (error && !data) {
    return <ApiErrorState error={error} ns={ns} />;
  }
  const buckets = data?.buckets ?? [];
  const createButton = (
    <Button variant="primary" onClick={() => setCreating(true)}>
      Create bucket
    </Button>
  );
  return (
    <>
      <InlineError error={error} />
      {buckets.length === 0 ? (
        <EmptyState headingLevel="h2" icon={DatabaseIcon} titleText="No buckets">
          <EmptyStateBody>This project has object storage but no bucket yet.</EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>{createButton}</EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      ) : (
        <Table
          data={buckets}
          columns={columns}
          variant="compact"
          data-testid="ceamls-buckets-table"
          toolbarContent={<ToolbarItem>{createButton}</ToolbarItem>}
          rowRenderer={(bucket) => (
            <BucketRow
              key={bucket.name}
              ns={ns}
              bucket={bucket}
              isDefault={bucket.name === data?.default}
              onDelete={setDeleting}
            />
          )}
        />
      )}
      {creating && (
        <CreateBucketModal ns={ns} onCreated={reload} onClose={() => setCreating(false)} />
      )}
      {deleting && (
        <DeleteBucketModal
          ns={ns}
          bucket={deleting.name}
          onDone={reload}
          onClose={() => setDeleting(undefined)}
        />
      )}
    </>
  );
};
