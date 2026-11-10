// CEAMLS: the arithmetic of the project Overview tab. No React here, so
// that the unit tests read it alone.
import type { K8sResourceCommon } from '@openshift/dynamic-plugin-sdk-utils';
import { cpuCores, memoryBytesOf } from '#~/pages/ceamls/vms/api';

const GIB = 1024 ** 3;

export const GPU_KEY = 'requests.nvidia.com/gpu';
const SAFE_KEY = 'ceph-safe.storageclass.storage.k8s.io/requests.storage';
const BULK_KEYS = [
  'ceph-bulk.storageclass.storage.k8s.io/requests.storage',
  'ceph-fs.storageclass.storage.k8s.io/requests.storage',
];

/** The share of a quota from which the row says "Almost full". */
export const ALMOST_FULL = 0.9;

export type QuotaState = 'ok' | 'almost' | 'full' | 'none' | 'unknown';

export type QuotaRow = {
  key: string;
  label: string;
  state: QuotaState;
  /** 0 to 100, for the bar. */
  percent: number;
  /** "4", "185". Empty when the row has no numbers. */
  usedText: string;
  /** "8", "200 GiB": the bold part. */
  totalText: string;
  /** "4 free". */
  freeText: string;
};

const round1 = (n: number): number => Math.round(n * 10) / 10;

const row = (
  key: string,
  label: string,
  used: number,
  total: number,
  unit: string,
  scale = 1,
): QuotaRow => {
  if (!total) {
    return { key, label, state: 'none', percent: 0, usedText: '', totalText: '', freeText: '' };
  }
  const share = used / total;
  const state: QuotaState = share >= 1 ? 'full' : share >= ALMOST_FULL ? 'almost' : 'ok';
  const text = (n: number) => String(round1(n / scale));
  const free = Math.max(0, total - used);
  return {
    key,
    label,
    state,
    percent: Math.min(100, Math.round(share * 100)),
    usedText: text(used),
    totalText: unit ? `${text(total)} ${unit}` : text(total),
    freeText: `${text(free)}${unit ? ` ${unit}` : ''} free`,
  };
};

/** What is known about the project's object storage. */
export type ObjectStorage = { known: false } | { known: true; capBytes: number; usedBytes: number };

/**
 * The rows of the Quotas block, from the hard and used values of the
 * project's ResourceQuota. A project holds one cap for bulk storage on
 * two storage classes; the row shows the class that is nearer to its cap.
 */
export const quotaRows = (
  hard: Record<string, string>,
  used: Record<string, string>,
  object: ObjectStorage,
): QuotaRow[] => {
  const bytes = (rec: Record<string, string>, key: string) => memoryBytesOf(rec[key] ?? '0');
  const bulkKey = BULK_KEYS.reduce((best, k) =>
    bytes(used, k) / (bytes(hard, k) || 1) > bytes(used, best) / (bytes(hard, best) || 1)
      ? k
      : best,
  );
  const bulkTotal = Math.max(...BULK_KEYS.map((k) => bytes(hard, k)));
  const rows = [
    row('gpu', 'GPU units', Number(used[GPU_KEY] ?? 0), Number(hard[GPU_KEY] ?? 0), ''),
    row(
      'cpu',
      'CPU cores',
      cpuCores(used['requests.cpu'] ?? '0'),
      cpuCores(hard['requests.cpu'] ?? '0'),
      '',
    ),
    row(
      'memory',
      'Memory',
      bytes(used, 'requests.memory'),
      bytes(hard, 'requests.memory'),
      'GiB',
      GIB,
    ),
    row('storage', 'Volume storage', bytes(used, SAFE_KEY), bytes(hard, SAFE_KEY), 'GiB', GIB),
    row('bulk', 'Bulk storage', bytes(used, bulkKey), bulkTotal, 'GiB', GIB),
  ];
  if (!object.known) {
    rows.push({
      key: 'object',
      label: 'Object storage',
      state: 'unknown',
      percent: 0,
      usedText: '',
      totalText: '',
      freeText: '',
    });
  } else {
    rows.push(row('object', 'Object storage', object.usedBytes, object.capBytes, 'GiB', GIB));
  }
  return rows;
};

/** The parts of a Pod that the Resource Allocation table reads. */
export type PodLite = K8sResourceCommon & {
  spec?: { containers?: { resources?: { requests?: Record<string, string> } }[] };
  status?: { phase?: string; startTime?: string };
};

export type WorkloadKind =
  | 'Workbench'
  | 'Virtual machine'
  | 'Model deployment'
  | 'Pipeline server'
  | 'Other';

export type Workload = {
  name: string;
  kind: WorkloadKind;
  /** The account that started it, or '' when the cluster does not record it. */
  startedBy: string;
  gpu: number;
  cpu: number;
  memoryBytes: number;
  /** The start of the oldest pod, in ms. Undefined while nothing started. */
  startedAt?: number;
};

const KIND_ORDER: WorkloadKind[] = [
  'Workbench',
  'Virtual machine',
  'Model deployment',
  'Pipeline server',
  'Other',
];

const identify = (pod: PodLite): { name: string; kind: WorkloadKind } => {
  const labels = pod.metadata?.labels ?? {};
  if (labels['notebook-name']) {
    return { name: labels['notebook-name'], kind: 'Workbench' };
  }
  if (labels['vm.kubevirt.io/name']) {
    return { name: labels['vm.kubevirt.io/name'], kind: 'Virtual machine' };
  }
  if (labels['serving.kserve.io/inferenceservice']) {
    return { name: labels['serving.kserve.io/inferenceservice'], kind: 'Model deployment' };
  }
  if (labels['app.kubernetes.io/part-of'] === 'llminferenceservice') {
    return {
      name: labels['app.kubernetes.io/name'] || pod.metadata?.name || '',
      kind: 'Model deployment',
    };
  }
  if (labels.component === 'data-science-pipelines') {
    return { name: 'Pipeline server', kind: 'Pipeline server' };
  }
  const owner = pod.metadata?.ownerReferences?.[0];
  // A ReplicaSet is named <deployment>-<hash>: show the deployment.
  const name =
    owner?.kind === 'ReplicaSet'
      ? owner.name.replace(/-[a-z0-9]+$/, '')
      : owner?.name || pod.metadata?.name || '';
  return { name, kind: 'Other' };
};

/**
 * What holds the quota now: the pods that are not finished, as one row
 * per workbench, virtual machine or model deployment. The sum of the
 * rows is the "used" value of the quota.
 */
export const workloads = (pods: PodLite[]): Workload[] => {
  const byKey = new Map<string, Workload>();
  pods.forEach((pod) => {
    const phase = pod.status?.phase;
    if (phase === 'Succeeded' || phase === 'Failed') {
      return;
    }
    const { name, kind } = identify(pod);
    const key = `${kind}/${name}`;
    const w = byKey.get(key) ?? { name, kind, startedBy: '', gpu: 0, cpu: 0, memoryBytes: 0 };
    (pod.spec?.containers ?? []).forEach((c) => {
      const req = c.resources?.requests ?? {};
      w.gpu += Number(req['nvidia.com/gpu'] ?? 0);
      w.cpu += cpuCores(req.cpu || '0');
      w.memoryBytes += memoryBytesOf(req.memory || '0');
    });
    w.startedBy ||= pod.metadata?.annotations?.['opendatahub.io/username'] ?? '';
    const start = pod.status?.startTime ? Date.parse(pod.status.startTime) : NaN;
    if (Number.isFinite(start) && (w.startedAt === undefined || start < w.startedAt)) {
      w.startedAt = start;
    }
    byKey.set(key, w);
  });
  return [...byKey.values()].toSorted(
    (a, b) =>
      KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.name.localeCompare(b.name),
  );
};

/** "3 d 4 h", "5 h 12 min", "8 min". */
export const durationText = (ms: number): string => {
  const min = Math.max(0, Math.floor(ms / 60_000));
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  if (d) {
    return h ? `${d} d ${h} h` : `${d} d`;
  }
  if (h) {
    return min % 60 ? `${h} h ${min % 60} min` : `${h} h`;
  }
  return `${min} min`;
};

/** 1.5 as "1.5", 2 as "2". */
export const countText = (n: number): string => String(round1(n));

/** Bytes as "12.5 GiB". */
export const gibText = (b: number): string => `${round1(b / GIB)} GiB`;

/** "2026-06-01" as "1 June 2026". */
export const dateText = (iso: string): string => {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
};

export type Point = { x: number; y: number };

/**
 * The unit hours under a series of samples one step apart: 4 GPU units
 * for 2 hours are 8 GPU unit hours.
 */
export const unitHours = (points: Point[], stepSeconds: number): number =>
  (points.reduce((sum, p) => sum + p.y, 0) * stepSeconds) / 3600;
