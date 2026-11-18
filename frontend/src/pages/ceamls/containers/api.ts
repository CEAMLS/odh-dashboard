// CEAMLS: the data behind the System containers pages, a trial for
// administrators (planning/system_containers.md in the cluster repo).
//
// A system container is a pod that behaves like a machine: systemd, an SSH
// server, root, and a disk that stays. It shares the kernel of its node, so
// it uses GPUs the way a workbench does, and it starts in seconds.
//
// One machine is four objects in the project, all made here as the
// signed-in person:
//   Deployment  sc-<name>                  one pod; 0 replicas is "stopped"
//   PVC         sc-<name>-root             the machine's disk
//   Secret      ceamls-ssh-keys-sc-<name>  the SSH keys (CEAMLS Cluster Admin fills it)
// and, once for the project, a service account with the right to use the
// security constraint `ceamls-system-container`. Only an administrator can
// make that binding, which is what keeps the trial to administrators.
import * as React from 'react';
import {
  k8sCreateResource,
  k8sDeleteResource,
  k8sGetResource,
  k8sPatchResource,
} from '@openshift/dynamic-plugin-sdk-utils';
import type { K8sModelCommon, K8sResourceCommon } from '@openshift/dynamic-plugin-sdk-utils';
import { K8sStatusError } from '@odh-dashboard/k8s-core';
import { groupVersionKind } from '#~/api/k8sUtils';
import { PodModel } from '#~/api/models';
import useK8sWatchResourceList from '#~/utilities/useK8sWatchResourceList';
import type { CustomWatchK8sResult } from '#~/types';
import { ResourceQuotaModel, SecretModel } from '#~/pages/ceamls/vms/models';
import type { ResourceQuotaKind } from '#~/pages/ceamls/vms/types';
import {
  SSH_KEYS_SECRET,
  SSH_PEOPLE_ANNO,
  VM_LABEL,
  cpuCores,
  kickKeySync,
  secretKeyName,
  vmSecretName,
} from '#~/pages/ceamls/vms/api';
import type { SecretKind, VmState } from '#~/pages/ceamls/vms/api';
import type { DeploymentKind, PodKind, PvcKind } from './types';

export const DeploymentModel: K8sModelCommon = {
  apiVersion: 'v1',
  apiGroup: 'apps',
  kind: 'Deployment',
  plural: 'deployments',
};

const PvcModel: K8sModelCommon = {
  apiVersion: 'v1',
  kind: 'PersistentVolumeClaim',
  plural: 'persistentvolumeclaims',
};

const ServiceAccountModel: K8sModelCommon = {
  apiVersion: 'v1',
  kind: 'ServiceAccount',
  plural: 'serviceaccounts',
};

const RoleBindingModel: K8sModelCommon = {
  apiVersion: 'v1',
  apiGroup: 'rbac.authorization.k8s.io',
  kind: 'RoleBinding',
  plural: 'rolebindings',
};

/** On the Deployment and its pod: the name the person gave the machine. */
export const CONTAINER_LABEL = 'ceamls.morgan.edu/system-container';
const IMAGE_LABEL = 'ceamls.morgan.edu/image';
/** The service account of every system container in a project, and its constraint. */
const SERVICE_ACCOUNT = 'ceamls-system-container';
const SCC = 'ceamls-system-container';
const SCC_ROLE = 'ceamls-system-container-scc';
const DISK_CLASS = 'ceph-safe';
/** A share of a GPU, the unit a workbench takes too (four shares on each card). */
export const GPU = 'nvidia.com/gpu';
const MACHINE = 'machine';

export type ContainerImage = {
  name: string;
  title: string;
  note: string;
  user: string;
  ref: string;
};

export const IMAGES: ContainerImage[] = [
  {
    name: 'ubuntu-24.04',
    title: 'Ubuntu 24.04',
    note: 'With systemd, SSH, sudo, git, Python 3 and tmux.',
    user: 'ubuntu',
    ref: 'image-registry.openshift-image-registry.svc:5000/ceamls-system-containers/ubuntu:24.04',
  },
];

/** The object names of a machine. */
export const deploymentName = (name: string): string => `sc-${name}`;
const diskName = (name: string): string => `sc-${name}-root`;
/** The keys Secret, named like a VM's so that CEAMLS Cluster Admin keeps it. */
const keysSecretName = (name: string): string => vmSecretName(deploymentName(name));

export const containerName = (d: DeploymentKind): string =>
  d.metadata?.labels?.[CONTAINER_LABEL] ?? d.metadata?.name ?? '';

export const containerImage = (d: DeploymentKind): ContainerImage | undefined =>
  IMAGES.find((i) => i.name === d.metadata?.labels?.[IMAGE_LABEL]);

const machineOf = (d: DeploymentKind) =>
  d.spec.template.spec.containers.find((c) => c.name === MACHINE);

export type ContainerSize = { cpu: number; memory: string; gpus: number };

export const containerSize = (d: DeploymentKind): ContainerSize => {
  const requests = machineOf(d)?.resources?.requests ?? {};
  return {
    cpu: cpuCores(requests.cpu ?? '0'),
    memory: requests.memory ?? '',
    gpus: Number(requests[GPU] ?? '0') || 0,
  };
};

export const sizeText = (s: ContainerSize): string =>
  `${s.cpu} ${s.cpu === 1 ? 'CPU' : 'CPUs'}, ${s.memory.replace(/Gi$/, ' GiB')}${
    s.gpus > 0 ? `, ${s.gpus} GPU ${s.gpus === 1 ? 'share' : 'shares'}` : ''
  }`;

// -- reads ----------------------------------------------------------------------

export const useContainers = (ns: string): CustomWatchK8sResult<DeploymentKind[]> =>
  useK8sWatchResourceList<DeploymentKind[]>(
    React.useMemo(
      () => ({
        isList: true,
        groupVersionKind: groupVersionKind(DeploymentModel),
        namespace: ns,
        selector: { matchExpressions: [{ key: CONTAINER_LABEL, operator: 'Exists' }] },
      }),
      [ns],
    ),
    DeploymentModel,
  );

export const useContainerPods = (ns: string): CustomWatchK8sResult<PodKind[]> =>
  useK8sWatchResourceList<PodKind[]>(
    React.useMemo(
      () => ({
        isList: true,
        groupVersionKind: groupVersionKind(PodModel),
        namespace: ns,
        selector: { matchExpressions: [{ key: CONTAINER_LABEL, operator: 'Exists' }] },
      }),
      [ns],
    ),
    PodModel,
  );

/** The pod of a machine: the newest one that is not on its way out, else any. */
export const podOf = (pods: PodKind[], name: string): PodKind | undefined => {
  const mine = pods
    .filter((p) => p.metadata?.labels?.[CONTAINER_LABEL] === name)
    .toSorted((a, b) =>
      (b.metadata?.creationTimestamp ?? '').localeCompare(a.metadata?.creationTimestamp ?? ''),
    );
  return mine.find((p) => !p.metadata?.deletionTimestamp) ?? mine.at(0);
};

/** GPU shares: what the project's quota allows, and what is free of it. */
export const useGpuRoom = (ns: string): { total: number; free: number } => {
  const [quotas] = useK8sWatchResourceList<ResourceQuotaKind[]>(
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
    const key = `requests.${GPU}`;
    let total = 0;
    let free = 0;
    quotas.forEach((q) => {
      const hard = q.status?.hard?.[key];
      if (hard !== undefined) {
        total = Number(hard) || 0;
        free = Math.max(0, total - (Number(q.status?.used?.[key] ?? '0') || 0));
      }
    });
    return { total, free };
  }, [quotas]);
};

// -- the state ------------------------------------------------------------------

const BAD_WAITS = [
  'ImagePullBackOff',
  'ErrImagePull',
  'CrashLoopBackOff',
  'CreateContainerError',
  'CreateContainerConfigError',
  'RunContainerError',
];

const plainQuota = (message: string): string => {
  if (/exceeded quota/.test(message)) {
    if (/nvidia\.com\/gpu/.test(message)) {
      return 'The project has no GPU share free for this machine. Stop a workbench or a machine that holds one.';
    }
    return 'The project has no CPU or memory left for this machine. Stop a workbench or a machine.';
  }
  return message;
};

/** The machine's state in one word, from its Deployment and its pod. */
export const containerState = (
  d: DeploymentKind | undefined,
  pod: PodKind | undefined,
): VmState => {
  if (!d) {
    return { word: 'Unknown', tone: 'off', busy: false };
  }
  if (d.metadata?.deletionTimestamp) {
    return { word: 'Deleting', tone: 'wait', busy: true };
  }
  if ((d.spec.replicas ?? 1) === 0) {
    return pod
      ? { word: 'Stopping', tone: 'wait', busy: true }
      : { word: 'Stopped', tone: 'off', busy: false };
  }
  if (!pod) {
    const failure = d.status?.conditions?.find(
      (c) => c.type === 'ReplicaFailure' && c.status === 'True',
    );
    return failure
      ? {
          word: 'Not running',
          tone: 'bad',
          busy: false,
          detail: plainQuota(failure.message ?? ''),
        }
      : { word: 'Starting', tone: 'wait', busy: true };
  }
  if (pod.metadata?.deletionTimestamp) {
    return { word: 'Restarting', tone: 'wait', busy: true };
  }
  const unschedulable = pod.status?.conditions?.find(
    (c) => c.type === 'PodScheduled' && c.status === 'False' && c.reason === 'Unschedulable',
  );
  if (unschedulable) {
    return {
      word: 'Waiting',
      tone: 'wait',
      busy: false,
      detail: /nvidia\.com\/gpu/.test(unschedulable.message ?? '')
        ? 'Every GPU share on the cluster is in use. The machine starts when one is free.'
        : unschedulable.message,
    };
  }
  const statuses = [
    ...(pod.status?.initContainerStatuses ?? []),
    ...(pod.status?.containerStatuses ?? []),
  ];
  const bad = statuses.find((s) => BAD_WAITS.includes(s.state?.waiting?.reason ?? ''));
  if (bad) {
    return {
      word: 'Not running',
      tone: 'bad',
      busy: false,
      detail: bad.state?.waiting?.message ?? bad.state?.waiting?.reason,
    };
  }
  if (pod.status?.conditions?.some((c) => c.type === 'Ready' && c.status === 'True')) {
    return { word: 'Running', tone: 'ok', busy: false };
  }
  const seeding = pod.status?.initContainerStatuses?.some((s) => s.state?.running);
  return {
    word: 'Starting',
    tone: 'wait',
    busy: true,
    detail: seeding ? 'Copying the image to the disk. Only the first start does this.' : undefined,
  };
};

// -- changes --------------------------------------------------------------------

export type NewContainer = {
  name: string;
  image: ContainerImage;
  cpu: number;
  memoryGiB: number;
  diskGiB: number;
  gpus: number;
};

/** The first start copies these directories to the disk; the machine runs from the copies. */
const SYSTEM_DIRS = ['usr', 'etc', 'var', 'home', 'root', 'opt', 'srv'];

const SEED_SCRIPT = `set -e
if [ -e /disk/.ceamls-seeded ]; then exit 0; fi
for d in ${SYSTEM_DIRS.join(' ')}; do
  rm -rf "/disk/$d"
  cp -a "/$d" /disk/
done
touch /disk/.ceamls-seeded
`;

export const newDeployment = (ns: string, form: NewContainer, owner: string): DeploymentKind => {
  const labels = { [CONTAINER_LABEL]: form.name };
  const amounts = {
    cpu: String(form.cpu),
    memory: `${form.memoryGiB}Gi`,
    ...(form.gpus > 0 ? { [GPU]: String(form.gpus) } : {}),
  };
  return {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: deploymentName(form.name),
      namespace: ns,
      labels: {
        ...labels,
        [IMAGE_LABEL]: form.image.name,
        'app.kubernetes.io/managed-by': 'ceamls-hub',
      },
      annotations: { [SSH_PEOPLE_ANNO]: owner.toLowerCase() },
    },
    spec: {
      replicas: 1,
      // One pod at a time: the disk attaches to one pod only.
      strategy: { type: 'Recreate' },
      selector: { matchLabels: labels },
      template: {
        metadata: {
          labels,
          annotations: { 'openshift.io/required-scc': SCC },
        },
        spec: {
          serviceAccountName: SERVICE_ACCOUNT,
          automountServiceAccountToken: false,
          hostname: form.name,
          terminationGracePeriodSeconds: 30,
          // The SELinux type comes from the constraint. A type written here
          // without a level is refused.
          securityContext: {
            runAsUser: 0,
            runAsGroup: 0,
            // ping without a capability, for every user in the machine.
            sysctls: [{ name: 'net.ipv4.ping_group_range', value: '0 2147483647' }],
          },
          initContainers: [
            {
              name: 'seed',
              image: form.image.ref,
              imagePullPolicy: 'Always',
              command: ['/bin/sh', '-c', SEED_SCRIPT],
              securityContext: {
                allowPrivilegeEscalation: true,
                capabilities: { add: ['SETFCAP'] },
              },
              resources: {
                requests: { cpu: '1', memory: '1Gi' },
                limits: { cpu: '2', memory: '1Gi' },
              },
              volumeMounts: [{ name: 'root', mountPath: '/disk' }],
            },
          ],
          containers: [
            {
              name: MACHINE,
              image: form.image.ref,
              command: ['/sbin/init'],
              env: [{ name: 'container', value: 'oci' }],
              securityContext: {
                allowPrivilegeEscalation: true,
                capabilities: { add: ['SYS_CHROOT', 'AUDIT_WRITE', 'SETFCAP'] },
              },
              // Ready when systemd has finished the boot.
              readinessProbe: {
                exec: {
                  command: [
                    '/bin/sh',
                    '-c',
                    'systemctl is-system-running | grep -qE "running|degraded"',
                  ],
                },
                periodSeconds: 3,
              },
              resources: { requests: amounts, limits: amounts },
              volumeMounts: [
                ...SYSTEM_DIRS.map((d) => ({ name: 'root', mountPath: `/${d}`, subPath: d })),
                { name: 'ssh', mountPath: '/etc/ceamls/ssh', readOnly: true },
                { name: 'shm', mountPath: '/dev/shm' },
              ],
            },
          ],
          volumes: [
            { name: 'root', persistentVolumeClaim: { claimName: diskName(form.name) } },
            {
              name: 'ssh',
              secret: { secretName: keysSecretName(form.name), defaultMode: 0o444, optional: true },
            },
            { name: 'shm', emptyDir: { medium: 'Memory' } },
          ],
        },
      },
    },
  };
};

const exists = (e: unknown): boolean =>
  (e instanceof K8sStatusError && e.statusObject.code === 409) ||
  (e instanceof Error && /already exists/.test(e.message));

/** Create an object; one that is there already is fine. */
const ensure = async <T extends K8sResourceCommon>(
  model: K8sModelCommon,
  resource: T,
): Promise<void> => {
  try {
    await k8sCreateResource<T>({ model, resource });
  } catch (e) {
    if (!exists(e)) {
      throw e;
    }
  }
};

/** The project's service account for system containers, with its constraint. */
const ensureAccess = async (ns: string): Promise<void> => {
  await ensure(ServiceAccountModel, {
    apiVersion: 'v1',
    kind: 'ServiceAccount',
    metadata: { name: SERVICE_ACCOUNT, namespace: ns },
    automountServiceAccountToken: false,
  });
  await ensure(RoleBindingModel, {
    apiVersion: 'rbac.authorization.k8s.io/v1',
    kind: 'RoleBinding',
    metadata: { name: SCC_ROLE, namespace: ns },
    roleRef: { apiGroup: 'rbac.authorization.k8s.io', kind: 'ClusterRole', name: SCC_ROLE },
    subjects: [{ kind: 'ServiceAccount', name: SERVICE_ACCOUNT, namespace: ns }],
  });
};

const owned = (d: DeploymentKind) => [
  {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    name: d.metadata?.name ?? '',
    uid: d.metadata?.uid ?? '',
  },
];

export const createContainer = async (
  ns: string,
  form: NewContainer,
  owner: string,
): Promise<void> => {
  await ensureAccess(ns);
  const made = await k8sCreateResource<DeploymentKind>({
    model: DeploymentModel,
    resource: newDeployment(ns, form, owner),
  });
  try {
    // The disk and the keys belong to the Deployment, so they go with it.
    await k8sCreateResource<PvcKind>({
      model: PvcModel,
      resource: {
        apiVersion: 'v1',
        kind: 'PersistentVolumeClaim',
        metadata: {
          name: diskName(form.name),
          namespace: ns,
          labels: { [CONTAINER_LABEL]: form.name },
          ownerReferences: owned(made),
        },
        spec: {
          accessModes: ['ReadWriteOnce'],
          storageClassName: DISK_CLASS,
          resources: { requests: { storage: `${form.diskGiB}Gi` } },
        },
      },
    });
    // The maker's keys from the project's directory, so the first SSH works
    // at once. An administrator's keys are not in the directory; CEAMLS
    // Cluster Admin writes them a few seconds after the sync request.
    const directory = await k8sGetResource<SecretKind>({
      model: SecretModel,
      queryOptions: { name: SSH_KEYS_SECRET, ns },
    }).catch(() => undefined);
    const prefix = `${secretKeyName(owner)}-`;
    await ensure<SecretKind>(SecretModel, {
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: {
        name: keysSecretName(form.name),
        namespace: ns,
        labels: { 'ceamls.morgan.edu/project': ns, [VM_LABEL]: deploymentName(form.name) },
        annotations: { 'ceamls.morgan.edu/people': owner.toLowerCase() },
        ownerReferences: owned(made),
      },
      data: Object.fromEntries(
        Object.entries(directory?.data ?? {}).filter(([k]) => k.startsWith(prefix)),
      ),
    });
    await kickKeySync(ns);
  } catch (e) {
    await k8sDeleteResource({
      model: DeploymentModel,
      queryOptions: { name: deploymentName(form.name), ns },
    }).catch(() => undefined);
    throw e;
  }
};

/** Deletes the machine. Its disk and its keys Secret go with it. */
export const deleteContainer = (ns: string, name: string): Promise<unknown> =>
  k8sDeleteResource({
    model: DeploymentModel,
    queryOptions: { name: deploymentName(name), ns },
  });

const setReplicas = (ns: string, name: string, replicas: number): Promise<DeploymentKind> =>
  k8sPatchResource<DeploymentKind>({
    model: DeploymentModel,
    queryOptions: { name: deploymentName(name), ns },
    patches: [{ op: 'replace', path: '/spec/replicas', value: replicas }],
  });

export type ContainerAction = 'start' | 'stop' | 'restart';

export const containerAction = async (
  ns: string,
  name: string,
  action: ContainerAction,
  pod?: PodKind,
): Promise<void> => {
  if (action === 'restart') {
    // The Deployment makes a new pod when this one is gone.
    if (pod?.metadata?.name) {
      await k8sDeleteResource({ model: PodModel, queryOptions: { name: pod.metadata.name, ns } });
    }
    return;
  }
  await setReplicas(ns, name, action === 'start' ? 1 : 0);
};

/** A shell in the machine, through the hub's websocket proxy. One command
 *  word only: the proxy keeps one value of a repeated query key. */
export const shellSocketUrl = (ns: string, pod: string): string =>
  `${window.location.protocol.replace(/^http/i, 'ws')}//${
    window.location.host
  }/wss/k8s/api/v1/namespaces/${encodeURIComponent(ns)}/pods/${encodeURIComponent(
    pod,
  )}/exec?container=${MACHINE}&command=${encodeURIComponent(
    '/usr/local/bin/ceamls-shell',
  )}&stdin=true&stdout=true&stderr=true&tty=true`;

/** SSH from a computer with `oc` signed in: the connection goes through the cluster API. */
export const sshLine = (ns: string, name: string, user: string): string =>
  `ssh -o ProxyCommand="oc -n ${ns} exec -i deployment/${deploymentName(
    name,
  )} -c ${MACHINE} -- nc 127.0.0.1 22" ${user}@${name}`;

export const diskOf = async (ns: string, name: string): Promise<string | undefined> =>
  k8sGetResource<PvcKind>({ model: PvcModel, queryOptions: { name: diskName(name), ns } })
    .then((p) => p.spec.resources.requests.storage)
    .catch(() => undefined);
