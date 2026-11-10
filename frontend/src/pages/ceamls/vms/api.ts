// CEAMLS: the data behind the Virtual machines pages. Everything goes
// through the hub's cluster API proxy as the signed-in person; the cluster's
// RBAC decides what each call may do. planning/vm_pages.md in the cluster
// repo says why there is no service of our own here.
import * as React from 'react';
import {
  k8sCreateResource,
  k8sDeleteResource,
  k8sGetResource,
  k8sListResourceItems,
  k8sPatchResource,
  k8sUpdateResource,
  useK8sWatchResource,
} from '@openshift/dynamic-plugin-sdk-utils';
import type { K8sResourceCommon, WatchK8sResult } from '@openshift/dynamic-plugin-sdk-utils';
import { K8sStatusError, isK8sStatus } from '@odh-dashboard/k8s-core';
import { groupVersionKind } from '#~/api/k8sUtils';
import { EventModel, PodModel } from '#~/api/models';
import useK8sWatchResourceList from '#~/utilities/useK8sWatchResourceList';
import { useUser } from '#~/redux/selectors';
import type { CustomWatchK8sResult } from '#~/types';
import {
  ClusterInstancetypeModel,
  DataSourceModel,
  DataVolumeModel,
  InstancetypeModel,
  ResourceQuotaModel,
  SecretModel,
  VirtualMachineInstanceModel,
  VirtualMachineModel,
  VirtualMachineRestoreModel,
  VirtualMachineSnapshotModel,
} from './models';
import { withEnv } from './envVolumes';
import type {
  DataSourceKind,
  DataVolumeKind,
  EventKind,
  GuestFilesystem,
  GuestOsInfo,
  InstancetypeKind,
  ResourceQuotaKind,
  VirtualMachineInstanceKind,
  VirtualMachineKind,
  VirtualMachineRestoreKind,
  VirtualMachineSnapshotKind,
} from './types';

// -- the curated menu ---------------------------------------------------------

/** The namespace that holds the golden images (fixed by the operator). */
export const IMAGES_NS = 'kubevirt-os-images';
/** The storage class a machine's disk lands on; the quota key starts with it. */
export const DISK_CLASS = 'ceph-safe';

/**
 * The project's keys Secret: the directory. Who may have SSH access in the
 * project (annotations people, admins) and every key. A machine made
 * before 2026-11-08 installs every key in it.
 */
export const SSH_KEYS_SECRET = 'ceamls-ssh-keys';
/** A machine's SSH list: the emails of the people whose profile keys it installs. */
export const SSH_PEOPLE_ANNO = 'ceamls.morgan.edu/ssh-people';
/** On a machine's keys Secret: which machine it belongs to. */
export const VM_LABEL = 'ceamls.morgan.edu/vm';
/** The Secret of one machine's SSH keys: the keys of the people on its list. */
export const vmSecretName = (vm: string): string => `${SSH_KEYS_SECRET}-${vm}`;
/** The hub gateway routes this to the admin app (gitops/aiplatform/70-storage-api-route.yaml). */
const KEY_SYNC_URL = '/ceamls/api/ssh-keys/sync';

export const IMAGE_LABEL = 'ceamls.morgan.edu/image';

export type Image = {
  /** The DataSource name. */
  name: string;
  title: string;
  /** The login user the image makes. */
  user: string;
  note: string;
  /** Extra cloud-config lines for the first boot. */
  firstBoot?: string;
};

// The Ubuntu cloud image ships without the guest agent that tells the
// cluster the OS is up (the others have it). Install it at the first boot.
const UBUNTU_FIRST_BOOT =
  'package_update: true\npackages: [qemu-guest-agent]\nruncmd: [[systemctl, enable, --now, qemu-guest-agent]]\n';

// The guest agent writes the keys of the project's people into the
// user's authorized_keys while the machine runs (the qemuGuestAgent
// propagation in newVmObject). SELinux stops that write on Fedora and
// CentOS until the boolean is on. CentOS Stream 10's policy also lacks
// three capabilities, so it gets a small module too. Checked live on
// 2026-11-08 on all four images. The ceamls command (cli/src/cmd/vms.rs)
// and the console templates (scripts/render_vm_templates.py) in the
// cluster repo carry the same lines.
const SELINUX_FIRST_BOOT = 'runcmd:\n  - [setsebool, -P, virt_qemu_ga_manage_ssh, on]\n';
const SELINUX_FIRST_BOOT_EL10 =
  'write_files:\n  - path: /etc/selinux/ceamls-qemu-ga.cil\n    content: "(allow virt_qemu_ga_t self (capability (setgid setuid chown fowner dac_override dac_read_search)))\\n"\nruncmd:\n  - [setsebool, -P, virt_qemu_ga_manage_ssh, on]\n  - [semodule, -i, /etc/selinux/ceamls-qemu-ga.cil]\n';

/** The four images the cluster imports. The order is the order on the form. */
export const IMAGES: Image[] = [
  {
    name: 'ubuntu',
    title: 'Ubuntu 24.04',
    user: 'ubuntu',
    note: 'Long-term support. apt.',
    firstBoot: UBUNTU_FIRST_BOOT,
  },
  {
    name: 'fedora',
    title: 'Fedora',
    user: 'fedora',
    note: 'The current release. dnf.',
    firstBoot: SELINUX_FIRST_BOOT,
  },
  {
    name: 'centos-stream9',
    title: 'CentOS Stream 9',
    user: 'centos',
    note: 'Close to RHEL 9. dnf.',
    firstBoot: SELINUX_FIRST_BOOT,
  },
  {
    name: 'centos-stream10',
    title: 'CentOS Stream 10',
    user: 'centos',
    note: 'Close to RHEL 10. dnf.',
    firstBoot: SELINUX_FIRST_BOOT_EL10,
  },
];

/** The Secret data key the controller gives a person (admin_app/objects.py, secret_key_name). */
export const secretKeyName = (email: string): string =>
  email.toLowerCase().replace(/[^-._a-zA-Z0-9]/g, '_');

export type SecretKind = K8sResourceCommon & { data?: Record<string, string> };

const splitList = (raw: string | undefined): string[] =>
  (raw ?? '')
    .split(',')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);

/** The people on a machine's SSH list; undefined for a machine without one (made before 2026-11-08). */
export const sshPeople = (vm: VirtualMachineKind): string[] | undefined => {
  const raw = vm.metadata?.annotations?.[SSH_PEOPLE_ANNO];
  if (raw === undefined) {
    return undefined;
  }
  const out: string[] = [];
  splitList(raw).forEach((p) => {
    if (!out.includes(p)) {
      out.push(p);
    }
  });
  return out;
};

/** Who has a key in a keys Secret: the people whose data entries are there. */
const keyedIn = (secret: SecretKind | undefined): string[] =>
  Array.from(
    new Set(
      Object.keys(secret?.data ?? {}).map((k) => k.slice(0, Math.max(0, k.lastIndexOf('-')))),
    ),
  );

/** Who may have SSH access in the project, and who of them has a key. */
export type Directory = {
  people: string[];
  admins: string[];
  keyed: string[];
  mayAccess: (email: string) => boolean;
  hasKey: (email: string) => boolean;
};

const directoryOf = (secret: SecretKind | undefined): Directory => {
  const people = splitList(secret?.metadata?.annotations?.['ceamls.morgan.edu/people']);
  const admins = splitList(secret?.metadata?.annotations?.['ceamls.morgan.edu/admins']);
  // `keyed` names everyone with a key, administrators too; the data carries
  // the PI's and the members' keys only. An older controller has no `keyed`.
  const keyedAnno = secret?.metadata?.annotations?.['ceamls.morgan.edu/keyed'];
  const keyed = keyedAnno === undefined ? keyedIn(secret) : splitList(keyedAnno).map(secretKeyName);
  return {
    people,
    admins,
    keyed,
    mayAccess: (email) =>
      people.includes(email.toLowerCase()) || admins.includes(email.toLowerCase()),
    hasKey: (email) => keyed.includes(secretKeyName(email)),
  };
};

/**
 * Ask the cluster to copy the keys now (POST /api/ssh-keys/sync in the
 * admin app), instead of at its next minute. Quiet when it fails: the
 * minute still comes.
 */
export const kickKeySync = async (ns: string): Promise<void> => {
  try {
    await fetch(KEY_SYNC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
      body: JSON.stringify({ project: ns }),
    });
  } catch {
    // The controller copies the keys within a minute anyway.
  }
};

const setSshPeople = (ns: string, name: string, people: string[]): Promise<VirtualMachineKind> =>
  k8sPatchResource<VirtualMachineKind>({
    model: VirtualMachineModel,
    queryOptions: { name, ns },
    patches: [
      {
        op: 'add',
        path: `/metadata/annotations/${SSH_PEOPLE_ANNO.replace(/\//g, '~1')}`,
        value: people.join(','),
      },
    ],
  });

/** Put a person on the machine's SSH list, and have the keys copied now. */
export const shareVm = async (ns: string, vm: VirtualMachineKind, email: string): Promise<void> => {
  const name = vm.metadata?.name ?? '';
  const people = sshPeople(vm) ?? [];
  const who = email.trim().toLowerCase();
  if (!people.includes(who)) {
    await setSshPeople(ns, name, [...people, who]);
  }
  await kickKeySync(ns);
};

/** Take a person off the machine's SSH list. */
export const unshareVm = async (
  ns: string,
  vm: VirtualMachineKind,
  email: string,
): Promise<void> => {
  const name = vm.metadata?.name ?? '';
  const who = email.trim().toLowerCase();
  await setSshPeople(
    ns,
    name,
    (sshPeople(vm) ?? []).filter((p) => p !== who),
  );
  await kickKeySync(ns);
};

/**
 * Whether the signed-in person's SSH key is in the project's key Secret:
 * true, false, or undefined while it loads or when the Secret cannot be
 * read. The Secret is what the machines install, so it is the one truth.
 */
export const useMyKeyInProject = (ns: string): boolean | undefined => {
  const { username } = useUser();
  const [has, setHas] = React.useState<boolean | undefined>(undefined);
  React.useEffect(() => {
    let live = true;
    setHas(undefined);
    if (username) {
      const mine = `${secretKeyName(username)}-`;
      k8sGetResource<SecretKind>({
        model: SecretModel,
        queryOptions: { name: SSH_KEYS_SECRET, ns },
      })
        .then((s) => {
          if (live) {
            setHas(
              directoryOf(s).hasKey(username) ||
                Object.keys(s.data ?? {}).some((k) => k.startsWith(mine)),
            );
          }
        })
        .catch(() => {
          if (live) {
            setHas(undefined);
          }
        });
    }
    return () => {
      live = false;
    };
  }, [ns, username]);
  return has;
};

/** Does the machine take new keys while it runs (made since 2026-11-08)? */
export const liveKeys = (vm: VirtualMachineKind): boolean =>
  (vm.spec.template.spec.accessCredentials ?? []).some(
    (c) => 'qemuGuestAgent' in c.sshPublicKey.propagationMethod,
  );

export const imageByName = (name: string | undefined): Image | undefined =>
  IMAGES.find((i) => i.name === name);

export type Size = {
  name: string;
  /** Cluster-wide, the project's own (the dedicated-CPU grant), or the researcher's own numbers. */
  kind: 'VirtualMachineClusterInstancetype' | 'VirtualMachineInstancetype' | 'custom';
  cpu: number;
  memory: string;
  /** The family's display name from the object, e.g. "General purpose". */
  className: string;
  description: string;
};

export const CUSTOM_SIZE = 'custom';
export const CUSTOM_CPU_MAX = 64;
export const CUSTOM_MEMORY_MAX = 512;

/** A size the researcher types: shared CPU and the memory reserved in full, like the U series. */
export const customSize = (cpu: number, memoryGiB: number): Size => ({
  name: CUSTOM_SIZE,
  kind: 'custom',
  cpu,
  memory: `${memoryGiB}Gi`,
  className: 'Custom',
  description:
    'Your own numbers. CPU is shared with other machines and the memory is reserved in full, like the general purpose sizes.',
});

export const isCustom = (s: Size | undefined): boolean => s?.kind === 'custom';

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
export const cpuCores = (q: string): number => {
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
          // Whole CPUs: a machine cannot take a fraction.
          room.cpuFree = Math.max(0, Math.floor(total - cpuCores(used[key] ?? '0')));
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
  `${isCustom(s) ? 'Custom' : s.name} · ${s.cpu} ${s.cpu === 1 ? 'CPU' : 'CPUs'}, ${formatMemory(
    s.memory,
  )}`;

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

/** The project's directory, watched: undefined while it loads or when it cannot be read. */
export const useDirectory = (ns: string): Directory | undefined => {
  const [secret, loaded] = present(
    useK8sWatchResource<SecretKind>(
      React.useMemo(
        () => ({
          isList: false,
          groupVersionKind: groupVersionKind(SecretModel),
          namespace: ns,
          name: SSH_KEYS_SECRET,
        }),
        [ns],
      ),
      SecretModel,
    ),
  );
  return React.useMemo(
    () => (loaded && secret ? directoryOf(secret) : undefined),
    [secret, loaded],
  );
};

/** A machine's keys Secret, watched: who has a key in place. undefined while it loads or when absent. */
export const useVmKeys = (ns: string, vm: string): string[] | undefined => {
  const [secret, loaded] = present(
    useK8sWatchResource<SecretKind>(
      React.useMemo(
        () => ({
          isList: false,
          groupVersionKind: groupVersionKind(SecretModel),
          namespace: ns,
          name: vmSecretName(vm),
        }),
        [ns, vm],
      ),
      SecretModel,
    ),
  );
  return React.useMemo(() => (loaded && secret ? keyedIn(secret) : undefined), [secret, loaded]);
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
export const useVmis = (ns: string): [VirtualMachineInstanceKind[], boolean, unknown] =>
  useK8sWatchResourceList<VirtualMachineInstanceKind[]>(
    React.useMemo(
      () => ({
        isList: true,
        groupVersionKind: groupVersionKind(VirtualMachineInstanceModel),
        namespace: ns,
      }),
      [ns],
    ),
    VirtualMachineInstanceModel,
  );

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

/** How long the cluster waits for the guest agent before it calls the machine running anyway. */
const AGENT_WAIT_MS = 5 * 60 * 1000;

/** The OS is up: the guest agent inside it talks to the cluster. */
export const agentUp = (vmi: VirtualMachineInstanceKind | undefined): boolean =>
  vmi?.status?.conditions?.some((c) => c.type === 'AgentConnected' && c.status === 'True') ?? false;

const runningSince = (vmi: VirtualMachineInstanceKind): number => {
  const t =
    vmi.status?.phaseTransitionTimestamps?.find((p) => p.phase === 'Running')
      ?.phaseTransitionTimestamp ?? vmi.metadata?.creationTimestamp;
  return t ? Date.parse(t) : Date.now();
};

/**
 * The state in one word. "Running" means the OS is up, which the guest agent
 * reports; a machine whose agent never comes counts as running after a while.
 */
export const vmState = (
  vm: VirtualMachineKind | undefined,
  vmi?: VirtualMachineInstanceKind,
): VmState => {
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
      if (vmi && !agentUp(vmi) && Date.now() - runningSince(vmi) < AGENT_WAIT_MS) {
        return { word: 'Starting', tone: 'wait', busy: true };
      }
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

export const vmSizeName = (vm: VirtualMachineKind): string =>
  vm.spec.instancetype?.name ?? (vm.spec.template.spec.domain?.cpu?.cores ? CUSTOM_SIZE : '');

/** The machine's size: a named one from the list, or its own numbers. */
export const vmSize = (vm: VirtualMachineKind, sizes: Size[]): Size | undefined => {
  const sizeName = vm.spec.instancetype?.name;
  if (sizeName) {
    return sizes.find((s) => s.name === sizeName);
  }
  const { cpu, memory } = vm.spec.template.spec.domain ?? {};
  return cpu?.cores && memory?.guest
    ? customSize(cpu.cores, Math.round(memoryBytesOf(memory.guest) / GIB))
    : undefined;
};

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
  /** Load the project environment at boot (envVolumes.ts). */
  env?: boolean;
};

/** The object the form writes (planning/vm_pages.md section 6). `owner` starts the SSH list. */
export const newVmObject = (ns: string, form: NewVm, owner: string): VirtualMachineKind => {
  const vm = bareVmObject(ns, form, owner);
  return form.env ? withEnv(vm) : vm;
};

/**
 * A locally administered unicast MAC, `02:ce:` and four random bytes.
 * Without a fixed MAC the machine takes the MAC of its launcher pod, which
 * changes at every restart, and the guest's netplan (written at the first
 * boot, matched by MAC) leaves the interface without an address. The MAC
 * lives only inside the pod, so a clash is not possible.
 */
export const fixedMac = (): string => {
  const b = crypto.getRandomValues(new Uint8Array(4));
  return `02:ce:${Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(':')}`;
};

const fixedMacDevices = () => ({
  interfaces: [{ name: 'default', masquerade: {}, macAddress: fixedMac() }],
});

const bareVmObject = (ns: string, form: NewVm, owner: string): VirtualMachineKind => ({
  apiVersion: 'kubevirt.io/v1',
  kind: 'VirtualMachine',
  metadata: {
    name: form.name,
    namespace: ns,
    labels: {
      'app.kubernetes.io/managed-by': 'ceamls-hub',
      [IMAGE_LABEL]: form.image.name,
    },
    // The SSH list: the maker only. The machine's page adds people.
    annotations: { [SSH_PEOPLE_ANNO]: owner.toLowerCase() },
  },
  spec: {
    runStrategy: 'Always',
    ...(isCustom(form.size)
      ? {}
      : { instancetype: { kind: form.size.kind, name: form.size.name } }),
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
        domain: isCustom(form.size)
          ? {
              devices: fixedMacDevices(),
              cpu: { cores: form.size.cpu },
              memory: { guest: form.size.memory },
            }
          : { devices: fixedMacDevices() },
        networks: [{ name: 'default', pod: {} }],
        volumes: [
          { name: 'rootdisk', dataVolume: { name: form.name } },
          {
            name: 'cloudinitdisk',
            cloudInitNoCloud: {
              userData: `#cloud-config\nuser: ${form.image.user}\npassword: ${
                form.password
              }\nchpasswd: { expire: False }\n${form.image.firstBoot ?? ''}`,
            },
          },
        ],
        // The guest agent installs the keys of the machine's own Secret and
        // keeps them current while the machine runs. Not noCloud as well:
        // KubeVirt gives both entries the same volume name and the launcher
        // pod is refused.
        accessCredentials: [
          {
            sshPublicKey: {
              source: { secret: { secretName: vmSecretName(form.name) } },
              propagationMethod: { qemuGuestAgent: { users: [form.image.user] } },
            },
          },
        ],
      },
    },
  },
});

/**
 * The machine's keys Secret with the maker's keys from the project's
 * directory, so the machine starts with them (a machine whose Secret is
 * missing does not start). The controller takes it over within seconds.
 */
const writeVmSecret = async (ns: string, name: string, owner: string): Promise<void> => {
  const directory = await k8sGetResource<SecretKind>({
    model: SecretModel,
    queryOptions: { name: SSH_KEYS_SECRET, ns },
  }).catch(() => undefined);
  const prefix = `${secretKeyName(owner)}-`;
  const data = Object.fromEntries(
    Object.entries(directory?.data ?? {}).filter(([k]) => k.startsWith(prefix)),
  );
  const secret: SecretKind = {
    apiVersion: 'v1',
    kind: 'Secret',
    metadata: {
      name: vmSecretName(name),
      namespace: ns,
      labels: { 'ceamls.morgan.edu/project': ns, [VM_LABEL]: name },
      annotations: {
        'ceamls.morgan.edu/people': owner.toLowerCase(),
        'ceamls.morgan.edu/purpose': `SSH public keys of the people with SSH access to the machine ${name}. Made by the AI Hub; CEAMLS Cluster Admin keeps it current.`,
      },
    },
    data,
  };
  const existing = await k8sGetResource<SecretKind>({
    model: SecretModel,
    queryOptions: { name: vmSecretName(name), ns },
  }).catch(() => undefined);
  if (existing) {
    await k8sUpdateResource<SecretKind>({ model: SecretModel, resource: secret });
  } else {
    await k8sCreateResource<SecretKind>({ model: SecretModel, resource: secret });
  }
};

export const createVm = async (
  ns: string,
  form: NewVm,
  owner: string,
): Promise<VirtualMachineKind> => {
  await writeVmSecret(ns, form.name, owner);
  try {
    const made = await k8sCreateResource<VirtualMachineKind>({
      model: VirtualMachineModel,
      resource: newVmObject(ns, form, owner),
    });
    // The controller fills the machine's Secret now (an administrator's
    // keys are not in the project's directory) and takes it over.
    await kickKeySync(ns);
    return made;
  } catch (e) {
    await k8sDeleteResource({
      model: SecretModel,
      queryOptions: { name: vmSecretName(form.name), ns },
    }).catch(() => undefined);
    throw e;
  }
};

/**
 * Deletes the machine, then its snapshots: they are of no use without it
 * and hold space. The keys Secret goes with the owner reference.
 */
export const deleteVm = async (ns: string, name: string): Promise<unknown> => {
  const result = await k8sDeleteResource({
    model: VirtualMachineModel,
    queryOptions: { name, ns },
  });
  const all = await k8sListResourceItems<VirtualMachineSnapshotKind>({
    model: VirtualMachineSnapshotModel,
    queryOptions: { ns },
  }).catch(() => []);
  await Promise.all(
    all
      .filter((s) => s.spec.source.name === name)
      .map((s) =>
        k8sDeleteResource({
          model: VirtualMachineSnapshotModel,
          queryOptions: { name: s.metadata?.name ?? '', ns },
        }).catch(() => undefined),
      ),
  );
  return result;
};

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
/** The docs page on the profile and the SSH key. */
export const PROFILE_DOC_URL = 'https://console.apps.ceamls.morgan.edu/docs/account/your-profile/';

// -- the second version: usage, activity, the guest, snapshots -----------------
// planning/vm_pages.md section 10 in the cluster repo.

const subresourceUrl = (ns: string, name: string, sub: string): string =>
  `/api/k8s/apis/subresources.kubevirt.io/v1/namespaces/${encodeURIComponent(
    ns,
  )}/virtualmachineinstances/${encodeURIComponent(name)}/${sub}`;

const readJson = async <T>(url: string): Promise<T> => {
  const res = await fetch(url);
  if (res.status >= 400) {
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
  }
  const body: T = await res.json();
  return body;
};

/** What the guest agent says about the OS; needs the agent. */
export const fetchGuestOsInfo = (ns: string, name: string): Promise<GuestOsInfo> =>
  readJson<GuestOsInfo>(subresourceUrl(ns, name, 'guestosinfo'));

/** The file systems in the machine; needs the agent. */
export const fetchFilesystems = async (ns: string, name: string): Promise<GuestFilesystem[]> => {
  const r = await readJson<{ items?: GuestFilesystem[] }>(
    subresourceUrl(ns, name, 'filesystemlist'),
  );
  return r.items ?? [];
};

/** Reads something the guest agent reports, again each time `tick` changes. */
const useGuestRead = <T>(
  active: boolean,
  read: () => Promise<T>,
  tick: number,
): [T | undefined, boolean, string | undefined] => {
  const [value, setValue] = React.useState<T | undefined>(undefined);
  const [loaded, setLoaded] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);
  React.useEffect(() => {
    if (!active) {
      setValue(undefined);
      setLoaded(false);
      return undefined;
    }
    let live = true;
    read()
      .then((v) => {
        if (live) {
          setValue(v);
          setError(undefined);
        }
      })
      .catch((e: unknown) => {
        if (live) {
          setError(errorMessage(e));
        }
      })
      .finally(() => {
        if (live) {
          setLoaded(true);
        }
      });
    return () => {
      live = false;
    };
  }, [active, read, tick]);
  return [value, loaded, error];
};

/** A counter that goes up every `ms` while `active`, to re-read something. */
export const useTick = (active: boolean, ms: number): number => {
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    if (!active) {
      return undefined;
    }
    const id = setInterval(() => setTick((t) => t + 1), ms);
    return () => clearInterval(id);
  }, [active, ms]);
  return tick;
};

export const useGuestOsInfo = (
  ns: string,
  name: string,
  active: boolean,
): [GuestOsInfo | undefined, boolean, string | undefined] => {
  const read = React.useCallback(() => fetchGuestOsInfo(ns, name), [ns, name]);
  return useGuestRead(active, read, 0);
};

/** The file systems, read again every minute: the used space moves. */
export const useFilesystems = (
  ns: string,
  name: string,
  active: boolean,
): [GuestFilesystem[] | undefined, boolean, string | undefined] => {
  const read = React.useCallback(() => fetchFilesystems(ns, name), [ns, name]);
  return useGuestRead(active, read, useTick(active, 60_000));
};

/** The root file system, or the biggest one. */
export const rootFilesystem = (fs: GuestFilesystem[] | undefined): GuestFilesystem | undefined =>
  fs?.find((f) => f.mountPoint === '/') ??
  fs?.filter((f) => f.totalBytes > 0).toSorted((a, b) => b.totalBytes - a.totalBytes)[0];

/** "30 GiB, 8.1 GiB used (27 %)". */
export const diskUseLine = (f: GuestFilesystem): string =>
  `${formatBytes(f.totalBytes)}, ${formatBytes(f.usedBytes)} used (${Math.round(
    (f.usedBytes / f.totalBytes) * 100,
  )} %)`;

/** The disk copy of the machine (the DataVolume has the machine's name). */
export const useDataVolume = (
  ns: string,
  name: string,
): [DataVolumeKind | undefined, boolean, unknown] =>
  present(
    useK8sWatchResource<DataVolumeKind>(
      React.useMemo(
        () => ({
          isList: false,
          groupVersionKind: groupVersionKind(DataVolumeModel),
          namespace: ns,
          name,
        }),
        [ns, name],
      ),
      DataVolumeModel,
    ),
  );

/** "Copying the image to the disk, 43 %" while the copy runs, else undefined. */
export const copyProgress = (dv: DataVolumeKind | undefined): string | undefined => {
  const phase = dv?.status?.phase;
  if (!phase || phase === 'Succeeded') {
    return undefined;
  }
  const pct = Number.parseFloat(dv.status?.progress ?? '');
  if (
    phase === 'ImportInProgress' ||
    phase === 'CloneInProgress' ||
    phase === 'CSICloneInProgress'
  ) {
    return Number.isFinite(pct)
      ? `Copying the image to the disk, ${Math.round(pct)} %`
      : 'Copying the image to the disk';
  }
  if (phase === 'Pending' || phase === 'PendingPopulation' || phase === 'WaitForFirstConsumer') {
    return 'Waiting for disk space';
  }
  if (phase === 'Failed') {
    return undefined;
  }
  return 'Preparing the disk';
};

/** The events about the machine: the VM, its instance and its disk share the name. */
export const useVmEvents = (ns: string, name: string): CustomWatchK8sResult<EventKind[]> =>
  useK8sWatchResourceList<EventKind[]>(
    React.useMemo(
      () => ({
        isList: true,
        groupVersionKind: groupVersionKind(EventModel),
        namespace: ns,
        fieldSelector: `involvedObject.name=${name}`,
      }),
      [ns, name],
    ),
    EventModel,
  );

export const eventTime = (e: EventKind): string | undefined =>
  e.lastTimestamp ?? e.eventTime ?? e.firstTimestamp ?? e.metadata?.creationTimestamp;

/** Newest first. */
export const sortEvents = (events: EventKind[]): EventKind[] =>
  events.toSorted((a, b) => Date.parse(eventTime(b) ?? '') - Date.parse(eventTime(a) ?? ''));

/** The pod that runs the machine, by its label. */
export const useLauncherPod = (ns: string, name: string, active: boolean): string | undefined => {
  const [pods] = useK8sWatchResourceList<K8sResourceCommon[]>(
    React.useMemo(
      () =>
        active
          ? {
              isList: true,
              groupVersionKind: groupVersionKind(PodModel),
              namespace: ns,
              selector: {
                matchLabels: { 'kubevirt.io': 'virt-launcher', 'vm.kubevirt.io/name': name },
              },
            }
          : null,
      [ns, name, active],
    ),
    PodModel,
  );
  // The newest pod: a restart leaves the old one for a moment.
  return pods
    .toSorted(
      (a, b) =>
        Date.parse(b.metadata?.creationTimestamp ?? '') -
        Date.parse(a.metadata?.creationTimestamp ?? ''),
    )
    .at(0)?.metadata?.name;
};

/** The last lines of the machine's serial output, from the launcher pod. */
export const fetchBootLog = async (ns: string, pod: string, lines = 200): Promise<string> => {
  // The hub proxy parses an answer as JSON unless the request asks for text
  // first. The API server wants a JSON type somewhere in the list, so `*/*`
  // follows at a lower weight.
  const res = await fetch(
    `/api/k8s/api/v1/namespaces/${encodeURIComponent(ns)}/pods/${encodeURIComponent(
      pod,
    )}/log?container=guest-console-log&tailLines=${lines}`,
    { headers: { Accept: 'text/plain, */*;q=0.5' } },
  );
  if (res.status >= 400) {
    throw new Error(`The boot log could not be read (${res.status})`);
  }
  // The serial port carries terminal control codes (colors, cursor moves).
  // A read-only box shows the words only.
  const esc = String.fromCharCode(27);
  const csi = new RegExp(`${esc}\\[[0-9;?]*[ -/]*[@-~]`, 'g');
  const other = new RegExp(`${esc}[^[]`, 'g');
  return (await res.text()).replace(csi, '').replace(other, '').replace(/\r/g, '');
};

// -- snapshots --------------------------------------------------------------------

/** How many snapshots a machine may have. */
export const SNAPSHOT_CAP = 5;

export const SNAPSHOT_NOTE = 'ceamls.morgan.edu/note';

export const useSnapshots = (
  ns: string,
  name: string,
): [VirtualMachineSnapshotKind[], boolean, Error | undefined] => {
  const [all, loaded, error] = useK8sWatchResourceList<VirtualMachineSnapshotKind[]>(
    React.useMemo(
      () => ({
        isList: true,
        groupVersionKind: groupVersionKind(VirtualMachineSnapshotModel),
        namespace: ns,
      }),
      [ns],
    ),
    VirtualMachineSnapshotModel,
  );
  const own = React.useMemo(
    () =>
      all
        .filter((s) => s.spec.source.name === name)
        .toSorted(
          (a, b) =>
            Date.parse(b.metadata?.creationTimestamp ?? '') -
            Date.parse(a.metadata?.creationTimestamp ?? ''),
        ),
    [all, name],
  );
  return [own, loaded, error];
};

export const useRestores = (
  ns: string,
  name: string,
): [VirtualMachineRestoreKind[], boolean, Error | undefined] => {
  const [all, loaded, error] = useK8sWatchResourceList<VirtualMachineRestoreKind[]>(
    React.useMemo(
      () => ({
        isList: true,
        groupVersionKind: groupVersionKind(VirtualMachineRestoreModel),
        namespace: ns,
      }),
      [ns],
    ),
    VirtualMachineRestoreModel,
  );
  const own = React.useMemo(() => all.filter((r) => r.spec.target.name === name), [all, name]);
  return [own, loaded, error];
};

export type SnapshotState = { word: string; tone: StateTone; detail?: string };

export const snapshotState = (s: VirtualMachineSnapshotKind): SnapshotState => {
  if (s.status?.readyToUse) {
    return { word: 'Ready', tone: 'ok' };
  }
  if (s.status?.phase === 'Failed' || s.status?.error) {
    return { word: 'Failed', tone: 'bad', detail: s.status.error?.message };
  }
  if (s.metadata?.deletionTimestamp) {
    return { word: 'Deleting', tone: 'wait' };
  }
  return { word: 'Taking', tone: 'wait' };
};

/** The default name: the machine and the date, with a number when the date is taken. */
export const defaultSnapshotName = (vm: string, taken: string[]): string => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  // The local date, as the person sees it, not the UTC one.
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const base = `${vm}-${date}`;
  if (!taken.includes(base)) {
    return base;
  }
  let n = 2;
  while (taken.includes(`${base}-${n}`)) {
    n += 1;
  }
  return `${base}-${n}`;
};

export const createSnapshot = (
  ns: string,
  vm: string,
  name: string,
  note: string,
): Promise<VirtualMachineSnapshotKind> =>
  k8sCreateResource<VirtualMachineSnapshotKind>({
    model: VirtualMachineSnapshotModel,
    resource: {
      apiVersion: 'snapshot.kubevirt.io/v1beta1',
      kind: 'VirtualMachineSnapshot',
      metadata: {
        name,
        namespace: ns,
        labels: { 'app.kubernetes.io/managed-by': 'ceamls-hub' },
        ...(note.trim() ? { annotations: { [SNAPSHOT_NOTE]: note.trim() } } : {}),
      },
      spec: {
        source: { apiGroup: 'kubevirt.io', kind: 'VirtualMachine', name: vm },
        // A copy that does not finish in an hour is a failed one, not a hang.
        failureDeadline: '1h',
      },
    },
  });

export const deleteSnapshot = (ns: string, name: string): Promise<unknown> =>
  k8sDeleteResource({ model: VirtualMachineSnapshotModel, queryOptions: { name, ns } });

const sleep = (ms: number) =>
  new Promise<void>((r) => {
    setTimeout(r, ms);
  });

const getVm = (ns: string, name: string): Promise<VirtualMachineKind> =>
  k8sGetResource<VirtualMachineKind>({ model: VirtualMachineModel, queryOptions: { name, ns } });

/** Waits until the machine is stopped (no instance), two minutes at most. */
const waitStopped = async (ns: string, name: string): Promise<void> => {
  for (let i = 0; i < 60; i += 1) {
    const vm = await getVm(ns, name);
    if (vm.status?.printableStatus === 'Stopped') {
      return;
    }
    await sleep(2000);
  }
  throw new Error('The machine did not stop in two minutes. Try again.');
};

/**
 * Puts the disk back to a snapshot: stops the machine, restores, starts it
 * again. The restore itself can only run on a stopped machine. The restore
 * object stays, so the Activity and the state can show what happened.
 */
export const restoreSnapshot = async (
  ns: string,
  vm: string,
  snapshot: string,
  wasRunning: boolean,
): Promise<void> => {
  if (wasRunning) {
    await vmAction(ns, vm, 'stop');
    await waitStopped(ns, vm);
  }
  const restore = await k8sCreateResource<VirtualMachineRestoreKind>({
    model: VirtualMachineRestoreModel,
    resource: {
      apiVersion: 'snapshot.kubevirt.io/v1beta1',
      kind: 'VirtualMachineRestore',
      metadata: {
        generateName: `${vm}-restore-`,
        namespace: ns,
        labels: { 'app.kubernetes.io/managed-by': 'ceamls-hub' },
      },
      spec: {
        target: { apiGroup: 'kubevirt.io', kind: 'VirtualMachine', name: vm },
        virtualMachineSnapshotName: snapshot,
      },
    },
  });
  const restoreName = restore.metadata?.name ?? '';
  for (let i = 0; i < 90; i += 1) {
    const r = await k8sGetResource<VirtualMachineRestoreKind>({
      model: VirtualMachineRestoreModel,
      queryOptions: { name: restoreName, ns },
    });
    if (r.status?.complete) {
      break;
    }
    const failed = r.status?.conditions?.find((c) => c.type === 'Ready' && c.status === 'False');
    if (i === 89) {
      throw new Error(
        `The restore did not finish in three minutes. ${failed?.message ?? 'Check the Activity.'}`,
      );
    }
    await sleep(2000);
  }
  if (wasRunning) {
    await vmAction(ns, vm, 'start');
  }
};

/** A restore that is still running, if any. */
export const activeRestore = (
  restores: VirtualMachineRestoreKind[],
): VirtualMachineRestoreKind | undefined => restores.find((r) => !r.status?.complete);
