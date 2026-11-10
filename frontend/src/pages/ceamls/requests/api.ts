// CEAMLS: the project requests. Any signed-in person asks for a new
// project on the Projects page (Request a project). The admin app keeps
// the request (ceamls_ai_cluster repo, admin-app/admin_app/projreq.py)
// until an admin creates the project from it in CEAMLS Cluster Admin, or
// denies it with a reason. The hub gateway routes /ceamls/api/project-requests
// to the API with the signed-in person's token; the API finds out who
// the caller is and shows the person their own requests only.
import { jsonCall } from '#~/pages/ceamls/buckets/api';

const BASE = '/ceamls/api/project-requests';

/** What the person typed; empty means the cluster default. */
export type RequestedQuota = {
  gpu?: number;
  cpu?: number;
  memory?: number;
  storage?: number;
  objectStorage?: number;
};

export type ProjectRequest = {
  id: string;
  /** The short name asked for; the admin can change it. */
  name: string;
  title: string;
  description: string;
  /** The email of the principal investigator. */
  pi: string;
  endDate: string | null;
  quota: RequestedQuota;
  time: string;
  status: 'pending' | 'denied';
  denyReason?: string | null;
  deniedAt?: string | null;
};

export type MyRequests = {
  requests: ProjectRequest[];
  /** The email of the signed-in person. */
  you: string;
  /** The name of the signed-in person, or the email. */
  name: string;
  /** The person's standing group, when the accounts were readable. */
  standing: string | null;
  /** The cluster defaults: GPU units, CPU cores and GiB. */
  defaults: Required<RequestedQuota>;
};

export type NewProjectRequest = {
  name: string;
  title: string;
  description: string;
  pi: string;
  endDate: string;
  quota: Record<keyof RequestedQuota, string>;
};

export const getMyRequests = (): Promise<MyRequests> => jsonCall<MyRequests>(BASE);

export const requestProject = (body: NewProjectRequest): Promise<ProjectRequest> =>
  jsonCall(BASE, { method: 'POST', body: JSON.stringify(body) });

export const removeRequest = (id: string): Promise<unknown> =>
  jsonCall(`${BASE}/${encodeURIComponent(id)}`, { method: 'DELETE' });

/** The namespace name rule of the admin app (objects.NAME_RE). */
export const NAME_RE = /^[a-z0-9]([a-z0-9-]{0,50}[a-z0-9])?$/;

/** A short name from a title: "Accented speech, 2027" -> "accented-speech-2027". */
export const slugOf = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 52)
    .replace(/-+$/, '');
