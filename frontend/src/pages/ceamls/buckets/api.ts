// CEAMLS: the storage API of the admin app (ceamls_ai_cluster repo,
// admin-app/admin_app/web.py), on the hub's own address. The hub gateway
// routes /ceamls/api/storage to the API (gitops/aiplatform/70-storage-api-route.yaml),
// checks the session cookie first and adds the signed-in person's token to
// the request. So the API acts as that person, and the cluster's RBAC
// decides what is listed. Same contract as the console plugin's api.ts.
export const BASE = '/ceamls/api/storage';

export type Usage = { objects: number; bytes: number; complete: boolean };

export type Project = {
  name: string;
  title: string;
  status: string;
  bucket?: string;
  endpoint?: string;
  externalEndpoint: string;
  cap?: string;
  pipelines: boolean;
};

export type ProjectList = { projects: Project[]; externalEndpoint: string };

export type Bucket = { name: string; created?: string; usage?: Usage };

export type BucketList = { buckets: Bucket[]; default: string };

export type S3Object = { key: string; size: number; modified?: string };

export type ObjectPage = {
  objects: S3Object[];
  prefixes: string[];
  next: string | null;
  prefix: string;
};

export type Keys = {
  project: string;
  accessKey?: string;
  secretKey?: string;
  endpoint?: string;
  externalEndpoint: string;
  bucket?: string;
  region: string;
  cap?: string;
  pipelines: boolean;
  connection: string;
};

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const messageOf = (body: unknown): string | undefined => {
  if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
    return body.error;
  }
  return undefined;
};

export const toApiError = (e: unknown): ApiError => {
  if (e instanceof ApiError) {
    return e;
  }
  return new ApiError(0, e instanceof Error ? e.message : String(e));
};

const enc = encodeURIComponent;

export const encodeKey = (key: string): string => key.split('/').map(enc).join('/');

export const projectUrl = (ns: string): string => `${BASE}/${enc(ns)}`;

export const bucketUrl = (ns: string, bucket: string): string =>
  `${projectUrl(ns)}/buckets/${enc(bucket)}`;

export const objectUrl = (ns: string, bucket: string, key: string): string =>
  `${bucketUrl(ns, bucket)}/objects/${encodeKey(key)}`;

const SESSION_ENDED = 'Your session ended. Reload the page to sign in again.';

type CallInit = { method?: string; body?: string };

export const jsonCall = async <T>(url: string, init: CallInit = {}): Promise<T> => {
  const headers: Record<string, string> = { 'X-Requested-With': 'fetch' };
  if (init.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers, credentials: 'same-origin' });
  } catch (e) {
    throw new ApiError(0, e instanceof Error ? e.message : String(e));
  }
  // A session that ended gets the sign-in page from the gateway, not JSON.
  if (res.redirected || !(res.headers.get('content-type') ?? '').includes('application/json')) {
    throw new ApiError(res.ok ? 401 : res.status, res.ok ? SESSION_ENDED : `HTTP ${res.status}`);
  }
  let body: T | undefined;
  try {
    body = await res.json();
  } catch {
    body = undefined;
  }
  if (!res.ok || body === undefined) {
    throw new ApiError(res.status, messageOf(body) ?? (res.statusText || `HTTP ${res.status}`));
  }
  return body;
};

export const listProjects = (): Promise<ProjectList> => jsonCall<ProjectList>(BASE);

export const getKeys = (ns: string): Promise<Keys> => jsonCall<Keys>(`${projectUrl(ns)}/keys`);

export const listBuckets = (ns: string): Promise<BucketList> =>
  jsonCall<BucketList>(`${projectUrl(ns)}/buckets`);

export const createBucket = (ns: string, name: string): Promise<{ name: string }> =>
  jsonCall(`${projectUrl(ns)}/buckets`, { method: 'POST', body: JSON.stringify({ name }) });

export type PurgeStep = { deleted: number; done: boolean };

/** Delete one batch of the bucket's objects, then the bucket itself once
 * it is empty. Call until done is true. */
export const purgeBucket = (ns: string, bucket: string): Promise<PurgeStep> =>
  jsonCall(`${bucketUrl(ns, bucket)}?purge=1`, { method: 'DELETE' });

export const bucketUsage = (ns: string, bucket: string): Promise<Usage> =>
  jsonCall(`${bucketUrl(ns, bucket)}/usage`);

export const listObjects = (
  ns: string,
  bucket: string,
  prefix: string,
  token?: string | null,
): Promise<ObjectPage> => {
  const q = new URLSearchParams({ prefix });
  if (token) {
    q.set('token', token);
  }
  return jsonCall<ObjectPage>(`${bucketUrl(ns, bucket)}/objects?${q.toString()}`);
};

export const deleteObject = (
  ns: string,
  bucket: string,
  key: string,
): Promise<{ deleted: number }> => jsonCall(objectUrl(ns, bucket, key), { method: 'DELETE' });

export const deletePrefix = (
  ns: string,
  bucket: string,
  prefix: string,
): Promise<{ deleted: number }> =>
  jsonCall(`${objectUrl(ns, bucket, prefix)}?prefix=1`, { method: 'DELETE' });

/**
 * Upload one file as one object. XMLHttpRequest, not fetch, because only it
 * reports upload progress. The session cookie goes with it on its own.
 */
export const uploadObject = (
  ns: string,
  bucket: string,
  key: string,
  file: File,
  onProgress: (loaded: number, total: number) => void,
  signal?: AbortSignal,
): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', objectUrl(ns, bucket, key));
    xhr.setRequestHeader('X-Requested-With', 'fetch');
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) {
        onProgress(ev.loaded, ev.total);
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      let body: unknown;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = undefined;
      }
      reject(new ApiError(xhr.status, messageOf(body) ?? (xhr.statusText || `HTTP ${xhr.status}`)));
    };
    xhr.onerror = () => reject(new ApiError(0, 'the upload failed (network error)'));
    xhr.onabort = () => reject(new ApiError(0, 'the upload was cancelled'));
    if (signal) {
      signal.addEventListener('abort', () => xhr.abort());
    }
    xhr.send(file);
  });
