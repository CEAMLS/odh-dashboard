import { SortableData, kebabTableColumn } from '@odh-dashboard/ui-core';
import { StorageData } from '#~/pages/projects/types';
import { AccessMode } from '#~/pages/storageClasses/storageEnums';
import { MOUNT_PATH_PREFIX } from './const';

export const clusterStorageTableColumns: SortableData<StorageData>[] = [
  {
    label: 'ID',
    field: 'id',
    sortable: false,
    visibility: ['hidden'],
  },
  {
    label: 'Name',
    field: 'name',
    sortable: false,
  },
  {
    // CEAMLS: Shared in place of Access mode.
    label: 'Shared',
    field: 'accessMode',
    sortable: false,
    width: 15,
  },
  {
    label: 'Storage size',
    field: 'size',
    sortable: false,
  },
  {
    label: 'Mount path',
    field: 'mountPath',
    sortable: false,
  },
  kebabTableColumn(),
];

export const defaultClusterStorage = {
  name: 'storage',
  description: '',
  mountPath: MOUNT_PATH_PREFIX,
  accessMode: AccessMode.RWO,
};
