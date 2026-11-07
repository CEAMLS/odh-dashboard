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
        domain?: { devices?: Record<string, unknown> };
        volumes?: {
          name: string;
          dataVolume?: { name: string };
          cloudInitNoCloud?: { userData?: string };
        }[];
        accessCredentials?: {
          sshPublicKey: {
            source: { secret: { secretName: string } };
            propagationMethod: { noCloud: Record<string, never> };
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
    interfaces?: { ipAddress?: string }[];
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
