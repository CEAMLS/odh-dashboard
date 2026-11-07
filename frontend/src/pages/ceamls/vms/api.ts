// CEAMLS: the data behind the Virtual machines pages. Everything goes
// through the hub's cluster API proxy as the signed-in person; the cluster's
// RBAC decides what each call may do. planning/vm_pages.md in the cluster
// repo says why there is no service of our own here.
import * as React from 'react';
import {
  k8sCreateResource,
  k8sDeleteResource,
  useK8sWatchResource,
} from '@openshift/dynamic-plugin-sdk-utils';
import type { K8sResourceCommon, WatchK8sResult } from '@openshift/dynamic-plugin-sdk-utils';
import { K8sStatusError, isK8sStatus } from '@odh-dashboard/k8s-core';
import { groupVersionKind } from '#~/api/k8sUtils';
import useK8sWatchResourceList from '#~/utilities/useK8sWatchResourceList';
import type { CustomWatchK8sResult } from '#~/types';
import {
  ClusterInstancetypeModel,
  DataSourceModel,
  InstancetypeModel,
  ResourceQuotaModel,
  VirtualMachineInstanceModel,
  VirtualMachineModel,
} from './models';
import type {
  DataSourceKind,
  InstancetypeKind,
  ResourceQuotaKind,
  VirtualMachineInstanceKind,
  VirtualMachineKind,
} from './types';

// -- the curated menu ---------------------------------------------------------

/** The namespace that holds the golden images (fixed by the operator). */
export const IMAGES_NS = 'kubevirt-os-images';
/** The storage class a machine's disk lands on; the quota key starts with it. */
export const DISK_CLASS = 'ceph-safe';

export const SSH_KEYS_SECRET = 'ceamls-ssh-keys';

export const IMAGE_LABEL = 'ceamls.morgan.edu/image';

export type Image = {
  /** The DataSource name. */
  name: string;
  title: string;
  /** The login user the image makes. */
  user: string;
  note: string;
};

/** The four images the cluster imports. The order is the order on the form. */
export const IMAGES: Image[] = [
  { name: 'ubuntu', title: 'Ubuntu 24.04', user: 'ubuntu', note: 'Long-term support. apt.' },
  { name: 'fedora', title: 'Fedora', user: 'fedora', note: 'The current release. dnf.' },
  {
    name: 'centos-stream9',
    title: 'CentOS Stream 9',
    user: 'centos',
    note: 'Close to RHEL 9. dnf.',
  },
  {
    name: 'centos-stream10',
    title: 'CentOS Stream 10',
    user: 'centos',
    note: 'Close to RHEL 10. dnf.',
  },
];

export const imageByName = (name: string | undefined): Image | undefined =>
  IMAGES.find((i) => i.name === name);

export type Size = {
  name: string;
  /** Cluster-wide, or the project's own (the dedicated-CPU grant). */
  kind: 'VirtualMachineClusterInstancetype' | 'VirtualMachineInstancetype';
  cpu: number;
  memory: string;
  /** The family's display name from the object, e.g. "General purpose". */
  className: string;
  description: string;
};

const sizeOf = (it: InstancetypeKind, kind: Size['kind']): Size => ({
  name: it.metadata?.name ?? '',
  kind,
  cpu: it.spec.cpu.guest,
  memory: it.spec.memory.guest,
  className: it.metadata?.annotations?.['instancetype.kubevirt.io/displayName'] ?? 'Other',
  description: it.metadata?.annotations?.['instancetype.kubevirt.io/description'] ?? '',
});

export const memoryBytesOf = (q: string): number => {
  const m = /^(\d+(?:\.\d+)?)([KMGT]i?)?$/.exec(q.trim());
  if (!m) {
    return 0;
  }
  const n = Number(m[1]);
  const unit = m[2] || '';
  const powers: Record<string, number> = {
    '': 0,
    K: 1,
    Ki: 1,
    M: 2,
    Mi: 2,
    G: 3,
    Gi: 3,
    T: 4,
    Ti: 4,
  };
  const base = unit.endsWith('i') ? 1024 : 1000;
  return n * base ** (powers[unit] ?? 0);
};

/** "5615m" as 5.615, "2" as 2. */
const cpuCores = (q: string): number => {
  const m = /^(\d+(?:\.\d+)?)(m?)$/.exec(q.trim());
  if (!m) {
    return 0;
  }
  return m[2] ? Number(m[1]) / 1000 : Number(m[1]);
};

const GIB = 1024 ** 3;

/** Bytes as "30 GiB" or "512 MiB". */
export const formatBytes = (b: number): string =>
  b >= GIB ? `${Math.round((b / GIB) * 10) / 10} GiB` : `${Math.round(b / 1024 ** 2)} MiB`;

/** What the project's quota still allows, read from its ResourceQuota objects. */
export type Room = {
  loaded: boolean;
  /** Bytes of disk still free on the storage class the disks use, or undefined without a limit. */
  diskFree?: number;
  diskTotal?: number;
  cpuFree?: number;
  cpuTotal?: number;
  memoryFree?: number;
  memoryTotal?: number;
};

const DISK_QUOTA_KEY = /storageclass\.storage\.k8s\.io\/requests\.storage$/;

export const useRoom = (ns: string): Room => {
  const [quotas, loaded] = useK8sWatchResourceList<ResourceQuotaKind[]>(
    React.useMemo(
      () => ({
        isList: true,
        groupVersionKind: groupVersionKind(ResourceQuotaModel),
        namespace: ns,
      }),
      [ns],
    ),
    ResourceQuotaModel,
  );
  return React.useMemo(() => {
    const room: Room = { loaded };
    quotas.forEach((q) => {
      const hard = q.status?.hard ?? {};
      const used = q.status?.used ?? {};
      Object.keys(hard).forEach((key) => {
        if (DISK_QUOTA_KEY.test(key) && key.startsWith(DISK_CLASS)) {
          const total = memoryBytesOf(hard[key]);
          room.diskTotal = total;
          room.diskFree = Math.max(0, total - memoryBytesOf(used[key] ?? '0'));
        } else if (key === 'requests.cpu') {
          const total = cpuCores(hard[key]);
          room.cpuTotal = total;
          room.cpuFree = Math.max(0, total - cpuCores(used[key] ?? '0'));
        } else if (key === 'requests.memory') {
          const total = memoryBytesOf(hard[key]);
          room.memoryTotal = total;
          room.memoryFree = Math.max(0, total - memoryBytesOf(used[key] ?? '0'));
        }
      });
    });
    return room;
  }, [quotas, loaded]);
};

/** "4Gi" as "4 GiB", "512Mi" as "512 MiB". */
export const formatMemory = (q: string): string => {
  const m = /^(\d+(?:\.\d+)?)([KMGT])i$/.exec(q.trim());
  return m ? `${m[1]} ${m[2]}iB` : q;
};

export const sizeLabel = (s: Size): string =>
  `${s.name} · ${s.cpu} ${s.cpu === 1 ? 'CPU' : 'CPUs'}, ${formatMemory(s.memory)}`;

/** The sizes a project may pick: the cluster families plus its own. */
export const useSizes = (ns: string): [Size[], boolean, Error | undefined] => {
  const [cluster, clusterLoaded, clusterError] = useK8sWatchResourceList<InstancetypeKind[]>(
    React.useMemo(
      () => ({ isList: true, groupVersionKind: groupVersionKind(ClusterInstancetypeModel) }),
      [],
    ),
    ClusterInstancetypeModel,
  );
  const [own, ownLoaded, ownError] = useK8sWatchResourceList<InstancetypeKind[]>(
    React.useMemo(
      () => ({
        isList: true,
        groupVersionKind: groupVersionKind(InstancetypeModel),
        namespace: ns,
      }),
      [ns],
    ),
    InstancetypeModel,
  );
  const sizes = React.useMemo(() => {
    const all = [
      ...cluster.map((it) => sizeOf(it, 'VirtualMachineClusterInstancetype')),
      ...own.map((it) => sizeOf(it, 'VirtualMachineInstancetype')),
    ];
    return all.toSorted(
      (a, b) =>
        a.className.localeCompare(b.className) ||
        a.cpu - b.cpu ||
        memoryBytesOf(a.memory) - memoryBytesOf(b.memory),
    );
  }, [cluster, own]);
  return [sizes, clusterLoaded && ownLoaded, clusterError ?? ownError];
};

export type ImageState = Image & {
  ready: boolean;
  /** The guest preference the image asks for. */
  preference: string;
};

/** The four images with their readiness and preference from the cluster. */
export const useImages = (): [ImageState[], boolean, Error | undefined] => {
  const [sources, loaded, error] = useK8sWatchResourceList<DataSourceKind[]>(
    React.useMemo(
      () => ({
        isList: true,
        groupVersionKind: groupVersionKind(DataSourceModel),
        namespace: IMAGES_NS,
      }),
      [],
    ),
    DataSourceModel,
  );
  const images = React.useMemo(
    () =>
      IMAGES.map((img) => {
        const ds = sources.find((s) => s.metadata?.name === img.name);
        return {
          ...img,
          ready:
            ds?.status?.conditions?.some((c) => c.type === 'Ready' && c.status === 'True') ?? false,
          preference:
            ds?.metadata?.labels?.['instancetype.kubevirt.io/default-preference'] ?? img.name,
        };
      }),
    [sources],
  );
  return [images, loaded, error];
};

// -- the machines ---------------------------------------------------------------

export const useVms = (ns: string): CustomWatchK8sResult<VirtualMachineKind[]> =>
  useK8sWatchResourceList<VirtualMachineKind[]>(
    React.useMemo(
      () => ({
        isList: true,
        groupVersionKind: groupVersionKind(VirtualMachineModel),
        namespace: ns,
      }),
      [ns],
    ),
    VirtualMachineModel,
  );

/** True for an object with a metadata.name. The SDK's typing says the data is
 *  always there, but it is `{}` or `null` before the first read, so the check
 *  starts from `unknown` and the lint cannot remove it. */
const named = (x: unknown): boolean => {
  if (typeof x !== 'object' || x === null) {
    return false;
  }
  const meta: unknown = Reflect.get(x, 'metadata');
  return typeof meta === 'object' && meta !== null && typeof Reflect.get(meta, 'name') === 'string';
};

/** The SDK gives `{}` or `null` for a single object before it arrives; that is "absent". */
const present = <T extends K8sResourceCommon>(
  result: WatchK8sResult<T>,
): [T | undefined, boolean, unknown] => {
  const [data, loaded, error] = result;
  return [named(data) ? data : undefined, loaded, error];
};

export const useVm = (
  ns: string,
  name: string,
): [VirtualMachineKind | undefined, boolean, unknown] =>
  present(
    useK8sWatchResource<VirtualMachineKind>(
      React.useMemo(
        () => ({
          isList: false,
          groupVersionKind: groupVersionKind(VirtualMachineModel),
          namespace: ns,
          name,
        }),
        [ns, name],
      ),
      VirtualMachineModel,
    ),
  );

/** The running instance of a machine; absent when it is off. */
export const useVmi = (
  ns: string,
  name: string,
): [VirtualMachineInstanceKind | undefined, boolean, unknown] =>
  present(
    useK8sWatchResource<VirtualMachineInstanceKind>(
      React.useMemo(
        () => ({
          isList: false,
          groupVersionKind: groupVersionKind(VirtualMachineInstanceModel),
          namespace: ns,
          name,
        }),
        [ns, name],
      ),
      VirtualMachineInstanceModel,
    ),
  );

export type StateTone = 'ok' | 'off' | 'wait' | 'bad';

export type VmState = {
  word: string;
  tone: StateTone;
  /** A change is under way; start and stop are not offered. */
  busy: boolean;
  /** The cluster's own word, shown when the state is a problem. */
  detail?: string;
};

/** The machine's state in one word, from the cluster's printable status. */
/** The quota message of the cluster in the project's words. */
export const plainProblem = (message: string): string => {
  if (/exceeded quota/.test(message)) {
    if (/requests\.storage/.test(message)) {
      return 'The project has no disk space left for this machine. Delete a volume or a machine you do not need, or ask for more space. The cluster tries again every few minutes.';
    }
    return 'The project has no CPU or memory left for this machine. Stop a workbench or a machine, or delete this one and pick a smaller size.';
  }
  return message;
};

export const vmState = (vm: VirtualMachineKind | undefined): VmState => {
  const s = vm?.status?.printableStatus ?? '';
  const failure = vm?.status?.conditions?.find((x) => x.type === 'Failure' && x.status === 'True');
  if (failure && s !== 'Running') {
    return {
      word: 'Not running',
      tone: 'bad',
      busy: false,
      detail: plainProblem(failure.message || failure.reason || s),
    };
  }
  switch (s) {
    case 'Running':
    case 'Migrating':
      return { word: 'Running', tone: 'ok', busy: false };
    case 'Stopped':
      return { word: 'Stopped', tone: 'off', busy: false };
    case 'Paused':
      return { word: 'Paused', tone: 'wait', busy: false };
    case 'Starting':
    case 'Provisioning':
    case 'WaitingForVolumeBinding':
    case 'WaitingForReceiver':
      return { word: 'Starting', tone: 'wait', busy: true };
    case 'Stopping':
    case 'Terminating':
      return { word: 'Stopping', tone: 'wait', busy: true };
    case '':
      return { word: 'Starting', tone: 'wait', busy: true };
    default:
      return { word: 'Not running', tone: 'bad', busy: false, detail: s };
  }
};

/** The last condition that explains a problem, if any. */
export const vmProblem = (vm: VirtualMachineKind | undefined): string | undefined => {
  const state = vmState(vm);
  if (state.detail) {
    return state.detail;
  }
  const c = vm?.status?.conditions?.find(
    (x) => x.status === 'False' && x.type === 'DataVolumesReady',
  );
  return c?.message ? plainProblem(c.message) : undefined;
};

export const vmImage = (vm: VirtualMachineKind): Image | undefined =>
  imageByName(
    vm.metadata?.labels?.[IMAGE_LABEL] ?? vm.spec.dataVolumeTemplates?.[0]?.spec.sourceRef?.name,
  );

export const vmSizeName = (vm: VirtualMachineKind): string => vm.spec.instancetype?.name ?? '';

export const vmDisk = (vm: VirtualMachineKind): string =>
  vm.spec.dataVolumeTemplates?.[0]?.spec.storage?.resources?.requests?.storage ?? '';

const cloudInitLine = (vm: VirtualMachineKind, key: string): string | undefined => {
  const data = vm.spec.template.spec.volumes?.find((v) => v.cloudInitNoCloud)?.cloudInitNoCloud
    ?.userData;
  const m = data ? new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(data) : null;
  return m ? m[1].trim() : undefined;
};

export const vmUser = (vm: VirtualMachineKind): string =>
  cloudInitLine(vm, 'user') ?? vmImage(vm)?.user ?? '';

export const vmPassword = (vm: VirtualMachineKind): string | undefined =>
  cloudInitLine(vm, 'password');

/** The address of the pod network interface, which other pods in the project can reach. */
export const vmiAddress = (vmi: VirtualMachineInstanceKind | undefined): string | undefined => {
  const interfaces = vmi?.status?.interfaces ?? [];
  const chosen = interfaces.find((i) => i.name === 'default') ?? interfaces.at(0);
  return chosen?.ipAddress;
};

// -- changes --------------------------------------------------------------------

/** Letters and digits without the ones that look alike. */
const PASSWORD_ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const makePassword = (length = 14): string => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length]).join('');
};

export const NAME_RE = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;

export type NewVm = {
  name: string;
  image: ImageState;
  size: Size;
  /** GiB. */
  disk: number;
  password: string;
};

/** The object the form writes (planning/vm_pages.md section 6). */
export const newVmObject = (ns: string, form: NewVm): VirtualMachineKind => ({
  apiVersion: 'kubevirt.io/v1',
  kind: 'VirtualMachine',
  metadata: {
    name: form.name,
    namespace: ns,
    labels: {
      'app.kubernetes.io/managed-by': 'ceamls-hub',
      [IMAGE_LABEL]: form.image.name,
    },
  },
  spec: {
    runStrategy: 'Always',
    instancetype: { kind: form.size.kind, name: form.size.name },
    preference: { kind: 'VirtualMachineClusterPreference', name: form.image.preference },
    dataVolumeTemplates: [
      {
        metadata: { name: form.name },
        spec: {
          storage: { resources: { requests: { storage: `${form.disk}Gi` } } },
          sourceRef: { kind: 'DataSource', name: form.image.name, namespace: IMAGES_NS },
        },
      },
    ],
    template: {
      spec: {
        domain: { devices: {} },
        volumes: [
          { name: 'rootdisk', dataVolume: { name: form.name } },
          {
            name: 'cloudinitdisk',
            cloudInitNoCloud: {
              userData: `#cloud-config\nuser: ${form.image.user}\npassword: ${form.password}\nchpasswd: { expire: False }\n`,
            },
          },
        ],
        accessCredentials: [
          {
            sshPublicKey: {
              source: { secret: { secretName: SSH_KEYS_SECRET } },
              propagationMethod: { noCloud: {} },
            },
          },
        ],
      },
    },
  },
});

export const createVm = (ns: string, form: NewVm): Promise<VirtualMachineKind> =>
  k8sCreateResource<VirtualMachineKind>({
    model: VirtualMachineModel,
    resource: newVmObject(ns, form),
  });

export const deleteVm = (ns: string, name: string): Promise<unknown> =>
  k8sDeleteResource({ model: VirtualMachineModel, queryOptions: { name, ns } });

export type VmAction = 'start' | 'stop' | 'restart';

/** A state change through the KubeVirt subresource, as the console does it. */
export const vmAction = async (ns: string, name: string, action: VmAction): Promise<void> => {
  const res = await fetch(
    `/api/k8s/apis/subresources.kubevirt.io/v1/namespaces/${encodeURIComponent(
      ns,
    )}/virtualmachines/${encodeURIComponent(name)}/${action}`,
    // The hub backend refuses a JSON request with no body, so send an empty object.
    { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' },
  );
  if (res.status < 400) {
    return;
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = undefined;
  }
  if (isK8sStatus(body)) {
    throw new K8sStatusError(body);
  }
  throw new Error(`The request failed (${res.status})`);
};

/** The serial console websocket, through the hub's proxy. */
export const consoleSocketUrl = (ns: string, name: string): string =>
  `${window.location.protocol.replace(/^http/i, 'ws')}//${
    window.location.host
  }/wss/k8s/apis/subresources.kubevirt.io/v1/namespaces/${encodeURIComponent(
    ns,
  )}/virtualmachineinstances/${encodeURIComponent(name)}/console`;

export const errorMessage = (e: unknown): string => {
  if (e instanceof Error) {
    return e.message;
  }
  return 'The request failed';
};

/** The address of the researcher docs. */
export const VM_TUTORIAL_URL =
  'https://console.apps.ceamls.morgan.edu/docs/tutorials/04-create-a-vm/';
