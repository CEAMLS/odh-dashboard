const globNamespace = ':namespace';
export const globNamespaceAll = `/${globNamespace}?/*`;

export const workbenchesRootPath = '/workbenches';
// Volumes (the project's persistent volumes). Was /storage until 2026-11-07;
// LegacyStorageRedirect forwards the old path.
export const storageRootPath = '/storage/volumes';
export const bucketsRootPath = '/storage/buckets';

export const workbenchesRoute = (namespace?: string): string =>
  !namespace ? workbenchesRootPath : `${workbenchesRootPath}/${namespace}`;

export const storageRoute = (namespace?: string): string =>
  !namespace ? storageRootPath : `${storageRootPath}/${namespace}`;

export const bucketsRoute = (namespace?: string): string =>
  !namespace ? bucketsRootPath : `${bucketsRootPath}/${namespace}`;

export const bucketRoute = (namespace: string, bucket: string): string =>
  `${bucketsRoute(namespace)}/${encodeURIComponent(bucket)}`;

// Virtual machines (planning/vm_pages.md in the cluster repo).
export const vmsRootPath = '/vms';

export const vmsRoute = (namespace?: string): string =>
  !namespace ? vmsRootPath : `${vmsRootPath}/${namespace}`;

export const createVmRoute = (namespace: string): string => `${vmsRoute(namespace)}/create`;

export const vmRoute = (namespace: string, name: string): string =>
  `${vmsRoute(namespace)}/${encodeURIComponent(name)}`;

/** The machine's console alone, for a new tab. */
export const vmConsoleRoute = (namespace: string, name: string): string =>
  `${vmRoute(namespace, name)}/console`;

// Secrets and variables: the project environment (planning/hub_pages.md section 3.6).
export const envRootPath = '/env';

export const envRoute = (namespace?: string): string =>
  !namespace ? envRootPath : `${envRootPath}/${namespace}`;
