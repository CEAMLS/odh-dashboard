import YAML from 'yaml';
import { vmLoadsEnv, withEnv, withEnvCloudInit } from '#~/pages/ceamls/vms/envVolumes';
import { newVmObject, IMAGES } from '#~/pages/ceamls/vms/api';
import type { ImageState, Size } from '#~/pages/ceamls/vms/api';

const image = (name: string): ImageState => {
  const found = IMAGES.find((i) => i.name === name);
  if (!found) {
    throw new Error(`no image ${name}`);
  }
  return { ...found, ready: true, preference: 'ubuntu' };
};

const size: Size = {
  name: 'u1.medium',
  kind: 'VirtualMachineClusterInstancetype',
  cpu: 2,
  memory: '8Gi',
  className: 'General purpose',
  description: '',
};

describe('withEnvCloudInit', () => {
  it('keeps the image first boot and adds the service', () => {
    const ubuntu = image('ubuntu');
    const userData = `#cloud-config\nuser: ${
      ubuntu.user
    }\npassword: pw\nchpasswd: { expire: False }\n${ubuntu.firstBoot ?? ''}`;
    const out = withEnvCloudInit(userData);
    expect(out.startsWith('#cloud-config\n')).toBe(true);
    const doc = YAML.parse(out.replace(/^#cloud-config\n/, ''));
    expect(doc.user).toBe(ubuntu.user);
    expect(doc.password).toBe('pw');
    expect(doc.packages).toEqual(['qemu-guest-agent']);
    // The image's own runcmd stays first; ours follow.
    expect(doc.runcmd[0]).toEqual(['systemctl', 'enable', '--now', 'qemu-guest-agent']);
    expect(doc.runcmd.at(-1)).toEqual(['systemctl', 'enable', '--now', 'ceamls-env.service']);
    expect(doc.write_files.map((f: { path: string }) => f.path)).toEqual([
      '/usr/local/sbin/ceamls-env-load',
      '/etc/systemd/system/ceamls-env.service',
      '/etc/profile.d/ceamls-env.sh',
    ]);
    expect(doc.write_files[0].permissions).toBe('0755');
    expect(doc.write_files[0].content).toContain('for label in CEAMLSENV CEAMLSSEC; do');
  });
  it('merges with an image that already writes files', () => {
    const el10 = IMAGES.find((i) => i.firstBoot?.includes('write_files'));
    expect(el10).toBeDefined();
    const out = withEnvCloudInit(`#cloud-config\nuser: cloud-user\n${el10?.firstBoot ?? ''}`);
    const doc = YAML.parse(out.replace(/^#cloud-config\n/, ''));
    expect(doc.write_files.length).toBeGreaterThan(3);
  });
});

describe('newVmObject with env', () => {
  const form = { name: 'env-test', image: image('ubuntu'), size, disk: 30, password: 'pw' };
  it('adds the two volumes and the boot service only when asked', () => {
    const plain = newVmObject('ns', form, 'me@x');
    expect(vmLoadsEnv(plain)).toBe(false);
    expect(plain.spec.template.spec.volumes).toHaveLength(2);

    const vm = newVmObject('ns', { ...form, env: true }, 'me@x');
    expect(vmLoadsEnv(vm)).toBe(true);
    const volumes = vm.spec.template.spec.volumes ?? [];
    expect(volumes).toHaveLength(4);
    expect(volumes[2]).toEqual({
      name: 'ceamls-env',
      configMap: { name: 'ceamls-env', optional: true, volumeLabel: 'CEAMLSENV' },
    });
    expect(volumes[3]).toEqual({
      name: 'ceamls-env-secrets',
      secret: { secretName: 'ceamls-env-secrets', optional: true, volumeLabel: 'CEAMLSSEC' },
    });
    expect(volumes[1].cloudInitNoCloud?.userData).toContain('ceamls-env.service');
    // No disks list: KubeVirt adds one per volume.
    expect(vm.spec.template.spec.domain?.devices).toEqual({});
    expect(withEnv(plain)).toEqual(vm);
  });
});
