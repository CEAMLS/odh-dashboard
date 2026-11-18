// CEAMLS: the parts of the Deployment and the Pod that the System containers
// pages use.
import type { K8sResourceCommon } from '@openshift/dynamic-plugin-sdk-utils';
import type { K8sCondition } from '#~/pages/ceamls/vms/types';

export type ContainerStatus = {
  name: string;
  ready?: boolean;
  state?: {
    waiting?: { reason?: string; message?: string };
    running?: { startedAt?: string };
    terminated?: { reason?: string; exitCode?: number };
  };
};

type Quantities = Record<string, string | undefined>;

export type PodSpec = {
  serviceAccountName?: string;
  automountServiceAccountToken?: boolean;
  hostname?: string;
  hostUsers?: boolean;
  runtimeClassName?: string;
  terminationGracePeriodSeconds?: number;
  nodeName?: string;
  securityContext?: Record<string, unknown>;
  initContainers?: Record<string, unknown>[];
  containers: {
    name: string;
    image: string;
    resources?: { requests?: Quantities; limits?: Quantities };
    [key: string]: unknown;
  }[];
  volumes?: Record<string, unknown>[];
};

export type DeploymentKind = K8sResourceCommon & {
  spec: {
    replicas?: number;
    strategy?: { type: string };
    selector: { matchLabels: Record<string, string> };
    template: {
      metadata?: { labels?: Record<string, string>; annotations?: Record<string, string> };
      spec: PodSpec;
    };
  };
  status?: {
    replicas?: number;
    readyReplicas?: number;
    conditions?: K8sCondition[];
  };
};

export type PodKind = K8sResourceCommon & {
  spec?: PodSpec;
  status?: {
    phase?: string;
    podIP?: string;
    conditions?: K8sCondition[];
    initContainerStatuses?: ContainerStatus[];
    containerStatuses?: ContainerStatus[];
  };
};

export type PvcKind = K8sResourceCommon & {
  spec: {
    accessModes: string[];
    storageClassName?: string;
    resources: { requests: { storage: string } };
  };
  status?: { phase?: string };
};
