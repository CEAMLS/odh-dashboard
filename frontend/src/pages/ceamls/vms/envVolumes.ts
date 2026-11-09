// CEAMLS: how a VM loads the project environment. Two extra volumes carry
// the ConfigMap and the Secret as small disks (KubeVirt builds them at each
// start, so a restart brings new values) and a cloud-init addition installs
// a boot service that writes /etc/ceamls/env from them. The ceamls command
// (`vm create`) builds the same thing; keep the two the same.
import YAML from 'yaml';
import {
  ENV_CLOUD_INIT_FILES,
  ENV_CLOUD_INIT_RUNCMD,
  ENV_VM_VOLUMES,
} from '#~/pages/ceamls/projectEnv/envUtils';
import type { VirtualMachineKind } from './types';

/** True when the VM carries the project environment disks. */
export const vmLoadsEnv = (vm: VirtualMachineKind): boolean =>
  (vm.spec.template.spec.volumes ?? []).some((v) => ENV_VM_VOLUMES.some((e) => e.name === v.name));

const asList = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);

/**
 * The cloud-config with the boot service added: the `write_files` and
 * `runcmd` lists are merged with the ones the image's first boot already
 * has, never replaced. The input starts with `#cloud-config`.
 */
export const withEnvCloudInit = (userData: string): string => {
  const body = userData.replace(/^#cloud-config[^\n]*\n?/, '');
  const parsed: unknown = YAML.parse(body) ?? {};
  const doc: Record<string, unknown> = {};
  if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
    Object.entries(parsed).forEach(([k, v]) => {
      doc[k] = v;
    });
  }
  // The cloud-init keys are snake_case.
  // eslint-disable-next-line camelcase
  doc.write_files = [...asList(doc.write_files), ...ENV_CLOUD_INIT_FILES];
  doc.runcmd = [...asList(doc.runcmd), ...ENV_CLOUD_INIT_RUNCMD];
  return `#cloud-config\n${YAML.stringify(doc, { lineWidth: 0 })}`;
};

/**
 * The VM object with the environment volumes and the boot service added.
 * No disk entries: KubeVirt adds a disk for every volume without one, the
 * way it does for rootdisk and cloudinitdisk here.
 */
export const withEnv = (vm: VirtualMachineKind): VirtualMachineKind => {
  const { spec } = vm.spec.template;
  const volumes = (spec.volumes ?? []).map((v) =>
    v.cloudInitNoCloud?.userData
      ? { ...v, cloudInitNoCloud: { userData: withEnvCloudInit(v.cloudInitNoCloud.userData) } }
      : v,
  );
  return {
    ...vm,
    spec: {
      ...vm.spec,
      template: {
        ...vm.spec.template,
        spec: { ...spec, volumes: [...volumes, ...ENV_VM_VOLUMES] },
      },
    },
  };
};
