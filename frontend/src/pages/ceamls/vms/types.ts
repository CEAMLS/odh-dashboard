// CEAMLS: the parts of the KubeVirt objects the Virtual machines pages use.
import type { K8sResourceCommon } from '@openshift/dynamic-plugin-sdk-utils';

export type K8sCondition = {
  type: string;
  status: string;
  reason?: string;
  message?: string;
};

export type VirtualMachineKind = K8sResourceCommon & {
  spec: {
    runStrategy?: string;
    instancetype?: { kind?: string; name: string };
    preference?: { kind?: string; name: string };
    dataVolumeTemplates?: {
      metadata: { name: string };
      spec: {
        storage?: { resources?: { requests?: { storage?: string } } };
        sourceRef?: { kind: string; name: string; namespace?: string };
      };
    }[];
    template: {
      spec: {
        domain?: {
          devices?: Record<string, unknown>;
          /** A custom size: no instancetype, the CPUs and memory on the machine itself. */
          cpu?: { cores?: number };
          memory?: { guest?: string };
        };
        volumes?: {
          name: string;
          dataVolume?: { name: string };
          cloudInitNoCloud?: { userData?: string };
        }[];
        accessCredentials?: {
          sshPublicKey: {
            source: { secret: { secretName: string } };
            propagationMethod:
              | { noCloud: Record<string, never> }
              | { qemuGuestAgent: { users: string[] } };
          };
        }[];
      };
    };
  };
  status?: {
    printableStatus?: string;
    conditions?: K8sCondition[];
    ready?: boolean;
  };
};

export type VirtualMachineInstanceKind = K8sResourceCommon & {
  status?: {
    phase?: string;
    phaseTransitionTimestamps?: { phase?: string; phaseTransitionTimestamp?: string }[];
    conditions?: K8sCondition[];
    interfaces?: { name?: string; ipAddress?: string }[];
    guestOSInfo?: { prettyName?: string };
  };
};

export type InstancetypeKind = K8sResourceCommon & {
  spec: {
    cpu: { guest: number; dedicatedCPUPlacement?: boolean };
    memory: { guest: string };
  };
};

export type DataSourceKind = K8sResourceCommon & {
  status?: { conditions?: K8sCondition[] };
};

export type ResourceQuotaKind = K8sResourceCommon & {
  status?: {
    hard?: Record<string, string>;
    used?: Record<string, string>;
  };
};

/** The disk copy that makes a machine's disk from an image. */
export type DataVolumeKind = K8sResourceCommon & {
  status?: {
    phase?: string;
    /** "43.21%" while the copy runs. */
    progress?: string;
    conditions?: K8sCondition[];
  };
};

export type EventKind = K8sResourceCommon & {
  type?: string;
  reason?: string;
  message?: string;
  count?: number;
  firstTimestamp?: string;
  lastTimestamp?: string;
  eventTime?: string;
  involvedObject: { kind?: string; name?: string };
  source?: { component?: string };
};

export type VirtualMachineSnapshotKind = K8sResourceCommon & {
  spec: {
    source: { apiGroup?: string; kind: string; name: string };
    deletionPolicy?: string;
    failureDeadline?: string;
  };
  status?: {
    readyToUse?: boolean;
    phase?: string;
    creationTime?: string;
    error?: { time?: string; message?: string };
    indications?: string[];
    conditions?: K8sCondition[];
  };
};

export type VirtualMachineRestoreKind = K8sResourceCommon & {
  spec: {
    target: { apiGroup?: string; kind: string; name: string };
    virtualMachineSnapshotName: string;
  };
  status?: {
    complete?: boolean;
    restoreTime?: string;
    conditions?: K8sCondition[];
  };
};

/** What the guest agent reports about the OS (the guestosinfo subresource). */
export type GuestOsInfo = {
  guestAgentVersion?: string;
  hostname?: string;
  os?: { name?: string; prettyName?: string; version?: string; kernelRelease?: string };
};

/** The file systems inside the machine (the filesystemlist subresource). */
export type GuestFilesystem = {
  diskName: string;
  mountPoint: string;
  fileSystemType: string;
  usedBytes: number;
  totalBytes: number;
};
