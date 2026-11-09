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
    // The image's own runcmd stays as it is.
    expect(doc.runcmd).toEqual([['systemctl', 'enable', '--now', 'qemu-guest-agent']]);
    expect(doc.mounts).toEqual([
      ['LABEL=CEAMLSENV', '/mnt/ceamls/env', 'iso9660', 'ro,nofail', '0', '0'],
      ['LABEL=CEAMLSSEC', '/mnt/ceamls/secrets', 'iso9660', 'ro,nofail', '0', '0'],
    ]);
    expect(doc.write_files.map((f: { path: string }) => f.path)).toEqual([
      '/etc/profile.d/ceamls-env.sh',
    ]);
    expect(doc.write_files[0].content).toContain(
      'for d in /mnt/ceamls/env /mnt/ceamls/secrets; do',
    );
    // KubeVirt refuses inline cloud-init over 2048 bytes.
    expect(out.length).toBeLessThan(2048);
  });
  it('merges with an image that already writes files', () => {
    const el10 = IMAGES.find((i) => i.firstBoot?.includes('write_files'));
    expect(el10).toBeDefined();
    const out = withEnvCloudInit(`#cloud-config\nuser: cloud-user\n${el10?.firstBoot ?? ''}`);
    const doc = YAML.parse(out.replace(/^#cloud-config\n/, ''));
    expect(doc.write_files.length).toBeGreaterThan(1);
    expect(out.length).toBeLessThan(2048);
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
    expect(volumes[1].cloudInitNoCloud?.userData).toContain('LABEL=CEAMLSENV');
    // No disks list: KubeVirt adds one per volume.
    expect(vm.spec.template.spec.domain?.devices).toEqual({});
    expect(withEnv(plain)).toEqual(vm);
  });
});
