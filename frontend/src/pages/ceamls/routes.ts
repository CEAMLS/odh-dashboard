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
