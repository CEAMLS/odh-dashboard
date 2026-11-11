import { SortableData } from '@odh-dashboard/ui-core';
import { getDisplayNameFromK8sResource, getPvcAccessMode } from '@odh-dashboard/k8s-core';
import { StorageTableData } from './types';
import { getContextStorageTypeExplanation, StorageContextType } from './useStorageContextType';

export const columns = (data: {
  storageContextTypes?: StorageContextType[];
}): SortableData<StorageTableData>[] => [
  {
    field: 'name',
    label: 'Name',
    width: 20,
    sortable: (a, b) =>
      getDisplayNameFromK8sResource(a.pvc).localeCompare(getDisplayNameFromK8sResource(b.pvc)),
  },
  {
    // CEAMLS: one column in place of Storage class and Access mode.
    field: 'accessMode',
    label: 'Shared',
    width: 10,
    sortable: (a, b) => getPvcAccessMode(a.pvc).localeCompare(getPvcAccessMode(b.pvc)),
    info: {
      popover:
        'Many workbenches can use a shared volume at the same time. One workbench at a time uses a volume that is not shared.',
      popoverProps: {
        showClose: true,
      },
    },
  },
  {
    field: 'storageContext',
    label: 'Storage context',
    width: 15,
    sortable: false,
    info: {
      popover: getContextStorageTypeExplanation(data.storageContextTypes ?? []),
      popoverProps: {
        showClose: true,
      },
    },
  },
  {
    field: 'storage_size',
    label: 'Storage size',
    width: 25,
    sortable: false,
  },
  {
    field: 'connected',
    label: 'Connected resources',
    width: 15,
    sortable: false,
  },
  {
    field: 'kebab',
    label: '',
    sortable: false,
  },
];
