import { StorageClassKind } from '#~/k8sTypes';
import { AccessMode, StorageProvisioner } from '#~/pages/storageClasses/storageEnums';

/**
 * CEAMLS: a person does not pick a storage class. A volume is of one of two
 * kinds. A volume for one workbench is on the default class of the cluster.
 * A shared volume, which many workbenches mount at the same time, is on the
 * class of the shared filesystem (CephFS).
 */
export const isSharedClass = (sc: StorageClassKind): boolean =>
  sc.provisioner.endsWith(StorageProvisioner.CEPHFS_CSI);

export const sharedClassName = (classes: StorageClassKind[]): string | undefined =>
  classes.find(isSharedClass)?.metadata.name;

export const isSharedAccessMode = (mode: string | undefined): boolean =>
  mode === AccessMode.RWX || mode === AccessMode.ROX;

export const sharedLabel = (mode: string | undefined): string =>
  isSharedAccessMode(mode) ? 'Yes' : 'No';
