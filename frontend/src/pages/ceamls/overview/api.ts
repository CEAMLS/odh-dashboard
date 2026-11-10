// CEAMLS: the project page API of the admin app (ceamls_ai_cluster repo,
// admin-app/admin_app/web.py), on the hub's own address. The hub gateway
// routes /ceamls/api/project to the API and adds the signed-in person's
// token. The API finds out who the caller is from that token, then acts
// with its own account: a researcher cannot read a ResearchProject or the
// accounts. The API decides who reads (the PI, the members, the admins)
// and who changes the members (the PI and the admins).
import { jsonCall } from '#~/pages/ceamls/buckets/api';

const BASE = '/ceamls/api/project';

export type Person = { email: string; name: string; role: 'pi' | 'member' };

export type AccessRequest = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  standing: string;
  reason: string;
  requestedBy: string;
  time: string;
  status: 'pending' | 'denied';
  denyReason?: string;
};

export type ProjectPage = {
  name: string;
  title: string;
  description: string;
  /** active, suspended or retired. */
  status: string;
  /** The PIs of the project: one or more, all with the same rights. */
  pis: Person[];
  startDate: string | null;
  endDate: string | null;
  daysLeft: number | null;
  deleteAfter?: string | null;
  people: Person[];
  /** The email of the signed-in person. */
  you: string;
  /** The signed-in person is the PI or an admin. */
  canManage: boolean;
  /** False when the accounts were not readable: the names are emails then. */
  keycloak: boolean;
  requests: AccessRequest[];
};

export type Candidate = { email: string; name: string; standing: string; onProject: boolean };

export type NewRequest = {
  email: string;
  firstName: string;
  lastName: string;
  standing: string;
  reason: string;
};

/** The standing of a new person: the group the account joins. */
export const STANDINGS: { value: string; label: string }[] = [
  { value: 'ceamls-researchers', label: 'Researcher' },
  { value: 'ceamls-core-faculty', label: 'Core faculty' },
  { value: 'ceamls-affiliates', label: 'Affiliate' },
];

const url = (ns: string): string => `${BASE}/${encodeURIComponent(ns)}`;

export const getProjectPage = (ns: string): Promise<ProjectPage> => jsonCall<ProjectPage>(url(ns));

export const searchCandidates = (
  ns: string,
  query: string,
): Promise<{ people: Candidate[]; more: boolean }> =>
  jsonCall(`${url(ns)}/candidates?q=${encodeURIComponent(query)}`);

/** Email lists: new members, people who leave, new PIs, PIs who become members. */
export type MemberChange = {
  add?: string[];
  remove?: string[];
  makePi?: string[];
  makeMember?: string[];
};

export const changeMembers = (ns: string, change: MemberChange): Promise<{ changed: string[] }> =>
  jsonCall(`${url(ns)}/members`, { method: 'POST', body: JSON.stringify(change) });

export const requestAccess = (ns: string, body: NewRequest): Promise<AccessRequest> =>
  jsonCall(`${url(ns)}/requests`, { method: 'POST', body: JSON.stringify(body) });

export const cancelRequest = (ns: string, id: string): Promise<unknown> =>
  jsonCall(`${url(ns)}/requests/${encodeURIComponent(id)}`, { method: 'DELETE' });
