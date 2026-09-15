const globNamespace = ':namespace';
export const globNamespaceAll = `/${globNamespace}?/*`;

export const workbenchesRootPath = '/workbenches';
export const storageRootPath = '/storage';

export const workbenchesRoute = (namespace?: string): string =>
  !namespace ? workbenchesRootPath : `${workbenchesRootPath}/${namespace}`;

export const storageRoute = (namespace?: string): string =>
  !namespace ? storageRootPath : `${storageRootPath}/${namespace}`;
