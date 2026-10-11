const globNamespace = ':namespace';
export const globNamespaceAll = `/${globNamespace}?/*`;

export const genAiRootPath = '/gen-ai-studio';
export const globGenAiAll = `${genAiRootPath}/*`;

export const chatPlaygroundRootPath = `${genAiRootPath}/playground`;
export const globChatPlaygroundAll = `${chatPlaygroundRootPath}/*`;

export const aiAssetsRootPath = `${genAiRootPath}/assets`;
export const globAiAssetsAll = `${aiAssetsRootPath}/*`;

// CEAMLS: the API playground. It talks to the model gateway through the
// Gen AI BFF session proxy, so it needs no OGX server and no pasted key.
export const apiPlaygroundRootPath = `${genAiRootPath}/api-playground`;
export const globApiPlaygroundAll = `${apiPlaygroundRootPath}/*`;

export const genAiChatPlaygroundRoute = (namespace?: string): string =>
  !namespace ? chatPlaygroundRootPath : `${chatPlaygroundRootPath}/${namespace}`;
export const genAiAiAssetsRoute = (namespace?: string): string =>
  !namespace ? aiAssetsRootPath : `${aiAssetsRootPath}/${namespace}`;
export const genAiApiPlaygroundRoute = (namespace?: string): string =>
  !namespace ? apiPlaygroundRootPath : `${apiPlaygroundRootPath}/${namespace}`;

// CEAMLS: the MaaS "API keys" page of the host app.
export const maasKeysPath = '/maas/keys-and-subs';

export const genAiAiAssetsTabRoute = (namespace: string, tab: string): string =>
  `${aiAssetsRootPath}/${namespace}/${tab}`;

export const maasTokensPath = '/maas/tokens';
