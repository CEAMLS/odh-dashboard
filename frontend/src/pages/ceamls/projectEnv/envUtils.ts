// CEAMLS: the project environment, the pure parts. The environment variables
// of a project live in two hidden objects: the ConfigMap `ceamls-env` (the
// variables) and the Secret `ceamls-env-secrets` (the secrets). One variable
// is one key. A workbench loads both with two envFrom entries; a VM mounts
// both as disks and a profile.d file exports them in every shell you open. The
// ceamls command (cli/src/cmd/env.rs in the cluster repo) uses the same
// names and the same disk labels. Plan: planning/hub_pages.md section 3.6.
import type { EnvironmentFromVariable } from '@odh-dashboard/k8s-core';

export const ENV_CONFIGMAP = 'ceamls-env';
export const ENV_SECRET = 'ceamls-env-secrets';
/** The names the workbench form must leave alone (not editable, not deletable). */
export const ENV_OBJECT_NAMES = [ENV_CONFIGMAP, ENV_SECRET];
export const LABEL = 'ceamls.morgan.edu/';
/** Who changed each variable and when, as JSON on both objects. */
export const META_ANNOTATION = `${LABEL}env-meta`;
/** The disk labels the guest mounts (the iso9660 volume ids). */
export const ENV_DISK_LABEL = 'CEAMLSENV';
export const SECRET_DISK_LABEL = 'CEAMLSSEC';

/** An environment variable name the shells and `envFrom` accept. */
export const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** The name the form asks for: capitals, digits and underscores. */
export const STRICT_NAME_RE = /^[A-Z_][A-Z0-9_]*$/;

export type VarMeta = { by?: string; at?: string };

export type EnvVar = {
  name: string;
  value: string;
  secret: boolean;
  by?: string;
  at?: string;
};

export const nameError = (name: string): string | undefined => {
  if (!name) {
    return 'Give the variable a name.';
  }
  if (!STRICT_NAME_RE.test(name)) {
    return 'Capital letters, digits and underscores, and not a digit first. Like HF_TOKEN.';
  }
  return undefined;
};

/** Typing help: what the person types becomes a valid name as they go. */
export const normalizeName = (raw: string): string => raw.toUpperCase().replace(/[^A-Z0-9_]/g, '_');

/** Names with these words start as secrets on the page and in the CLI. */
const SECRET_WORDS = ['TOKEN', 'KEY', 'PASSWORD', 'PASSWD', 'SECRET', 'CREDENTIAL'];

export const guessSecret = (name: string): boolean => {
  const upper = name.toUpperCase();
  return SECRET_WORDS.some((w) => upper.includes(w));
};

/**
 * The lines of a .env file: `NAME=value`, with an optional `export `, single
 * or double quotes around the value, blank lines and `#` comments. The last
 * line for a name wins. A line that is not a variable is reported.
 */
export const parseDotEnv = (
  text: string,
): { vars: { name: string; value: string }[]; bad: string[] } => {
  const byName = new Map<string, string>();
  const bad: string[] = [];
  text.split(/\r?\n/).forEach((raw) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) {
      return;
    }
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) {
      bad.push(raw);
      return;
    }
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    } else {
      // A trailing comment after an unquoted value.
      value = value.replace(/\s+#.*$/, '');
    }
    byName.set(m[1], value);
  });
  return { vars: Array.from(byName, ([name, value]) => ({ name, value })), bad };
};

/** The two envFrom entries a workbench carries when it uses the project environment. */
export const PROJECT_ENV_FROM: EnvironmentFromVariable[] = [
  { secretRef: { name: ENV_SECRET, optional: true } },
  { configMapRef: { name: ENV_CONFIGMAP, optional: true } },
];

export const isProjectEnvRef = (e: EnvironmentFromVariable): boolean =>
  e.secretRef?.name === ENV_SECRET || e.configMapRef?.name === ENV_CONFIGMAP;

export const hasProjectEnv = (envFrom: EnvironmentFromVariable[] | undefined): boolean =>
  (envFrom ?? []).some(isProjectEnvRef);

/** The list with the two entries present (on) or absent (off), the rest untouched. */
export const withProjectEnv = (
  envFrom: EnvironmentFromVariable[] | undefined,
  on: boolean,
): EnvironmentFromVariable[] => {
  const rest = (envFrom ?? []).filter((e) => !isProjectEnvRef(e));
  return on ? [...rest, ...PROJECT_ENV_FROM] : rest;
};

/** The meta annotation, parsed; an unreadable one counts as empty. */
export const parseMeta = (raw: string | undefined): Record<string, VarMeta> => {
  if (!raw) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    const out: Record<string, VarMeta> = {};
    Object.entries(parsed).forEach(([k, v]) => {
      if (typeof v === 'object' && v !== null) {
        const by: unknown = Reflect.get(v, 'by');
        const at: unknown = Reflect.get(v, 'at');
        out[k] = {
          by: typeof by === 'string' ? by : undefined,
          at: typeof at === 'string' ? at : undefined,
        };
      }
    });
    return out;
  } catch {
    return {};
  }
};

/** Decode a Secret's base64 value; unreadable bytes show as the raw text. */
export const decodeValue = (b64: string): string => {
  try {
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return b64;
  }
};

/** A value for a single-quoted shell string. */
export const shellQuote = (value: string): string => `'${value.replace(/'/g, `'\\''`)}'`;

/** One `export` line per variable, the way `ceamls env` prints them. */
export const exportLines = (vars: EnvVar[]): string =>
  vars.map((v) => `export ${v.name}=${shellQuote(v.value)}`).join('\n');

// -- the VM side: the two disks mounted at every boot, exported in every shell --
// Inline cloud-init is capped at 2048 bytes by KubeVirt, so there is no
// boot service: two fstab entries (cloud-init `mounts`) and one short
// profile.d file do the work.

/** Where the two disks are mounted in the guest. */
export const ENV_MOUNT = '/mnt/ceamls/env';
export const SECRET_MOUNT = '/mnt/ceamls/secrets';

/** The profile.d file. Also in cli/src/cmd/env.rs (PROFILE); keep them the same. */
export const ENV_PROFILE = `# The project environment (ceamls env): one file per variable on the
# disks ${ENV_DISK_LABEL} and ${SECRET_DISK_LABEL}, mounted by fstab. Exported in every shell you open.
for d in ${ENV_MOUNT} ${SECRET_MOUNT}; do
  for f in "$d"/*; do
    [ -f "$f" ] || continue
    n=\${f##*/}
    case $n in [A-Za-z_]*) ;; *) continue ;; esac
    case $n in *[!A-Za-z0-9_]*) continue ;; esac
    export "$n=$(cat "$f")"
  done
done
`;

export type CloudInitFile = { path: string; permissions: string; content: string };

export const ENV_CLOUD_INIT_FILES: CloudInitFile[] = [
  { path: '/etc/profile.d/ceamls-env.sh', permissions: '0644', content: ENV_PROFILE },
];

/** The fstab lines: the disks by label, read-only, and a missing one does not stop the boot. */
export const ENV_CLOUD_INIT_MOUNTS: string[][] = [
  [`LABEL=${ENV_DISK_LABEL}`, ENV_MOUNT, 'iso9660', 'ro,nofail', '0', '0'],
  [`LABEL=${SECRET_DISK_LABEL}`, SECRET_MOUNT, 'iso9660', 'ro,nofail', '0', '0'],
];

/** The two volumes a VM carries when it loads the project environment. */
export const ENV_VM_VOLUMES = [
  {
    name: 'ceamls-env',
    configMap: { name: ENV_CONFIGMAP, optional: true, volumeLabel: ENV_DISK_LABEL },
  },
  {
    name: 'ceamls-env-secrets',
    secret: { secretName: ENV_SECRET, optional: true, volumeLabel: SECRET_DISK_LABEL },
  },
];
