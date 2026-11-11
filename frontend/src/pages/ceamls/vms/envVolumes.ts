// CEAMLS: how a VM loads the project environment. Two extra volumes carry
// the ConfigMap and the Secret as small disks (KubeVirt builds them at each
// start, so a restart brings new values); cloud-init adds two fstab lines
// that mount them at /mnt/ceamls and a profile.d file that exports every
// file in every shell you open. The ceamls command (`vm create`) builds the same thing;
// keep the two the same.
import YAML from 'yaml';
import {
  ENV_CLOUD_INIT_FILES,
  ENV_CLOUD_INIT_MOUNTS,
  ENV_VM_VOLUMES,
} from '#~/pages/ceamls/projectEnv/envUtils';
import type { VirtualMachineKind } from './types';

/** True when the VM carries the project environment disks. */
export const vmLoadsEnv = (vm: VirtualMachineKind): boolean =>
  (vm.spec.template.spec.volumes ?? []).some((v) => ENV_VM_VOLUMES.some((e) => e.name === v.name));

const asList = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);

/**
 * The cloud-config with commands added to `runcmd`, after the ones the
 * image's first boot already has (the GPU setup). No commands: the text
 * comes back as it is.
 */
export const withRunCommands = (userData: string, commands: string[]): string => {
  if (commands.length === 0) {
    return userData;
  }
  const body = userData.replace(/^#cloud-config[^\n]*\n?/, '');
  const parsed: unknown = YAML.parse(body) ?? {};
  const doc: Record<string, unknown> = {};
  if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
    Object.entries(parsed).forEach(([k, v]) => {
      doc[k] = v;
    });
  }
  doc.runcmd = [...asList(doc.runcmd), ...commands];
  return `#cloud-config\n${YAML.stringify(doc, { lineWidth: 0 })}`;
};

/**
 * The cloud-config with the mounts and the profile file added: the
 * `write_files` and `mounts` lists are merged with the ones the image's
 * first boot already has, never replaced. The input starts with
 * `#cloud-config`. KubeVirt caps the whole thing at 2048 bytes.
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
  doc.mounts = [...asList(doc.mounts), ...ENV_CLOUD_INIT_MOUNTS];
  return `#cloud-config\n${YAML.stringify(doc, { lineWidth: 0 })}`;
};

/**
 * The VM object with the environment volumes, mounts and profile file added.
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
