// CEAMLS: the project environment, the pure parts. The environment variables
// of a project live in two hidden objects: the ConfigMap `ceamls-env` (the
// variables) and the Secret `ceamls-env-secrets` (the secrets). One variable
// is one key. A workbench loads both with two envFrom entries; a VM mounts
// both as disks and a boot service writes /etc/ceamls/env from them. The
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
/** The disk labels the boot service mounts (the iso9660 volume ids). */
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

// -- the VM side: a boot service that writes /etc/ceamls/env from two disks --

/** The guest script. Also in cli/src/cmd/vms.rs (ENV_LOAD_SCRIPT); keep them the same. */
export const ENV_LOAD_SCRIPT = `#!/bin/sh
# Writes /etc/ceamls/env from the two disks that carry the project
# environment: ${ENV_DISK_LABEL} (the variables) and ${SECRET_DISK_LABEL} (the secrets).
# The cluster builds the disks when the VM starts, so a restart brings
# new values. Runs from ceamls-env.service at every boot.
set -u
out=/etc/ceamls/env
tmp=$(mktemp)
chmod 0644 "$tmp"
echo "# Written by ceamls-env.service at $(date -u +%FT%TZ). Do not edit; change the project environment instead." >"$tmp"
n=0
for label in ${ENV_DISK_LABEL} ${SECRET_DISK_LABEL}; do
  dev=/dev/disk/by-label/$label
  i=0
  while [ ! -e "$dev" ] && [ $i -lt 10 ]; do sleep 1; i=$((i + 1)); done
  [ -e "$dev" ] || continue
  mnt=$(mktemp -d)
  if mount -o ro "$dev" "$mnt" 2>/dev/null; then
    for f in "$mnt"/*; do
      [ -f "$f" ] || continue
      name=$(basename "$f")
      case $name in [A-Za-z_]*) ;; *) continue ;; esac
      case $name in *[!A-Za-z0-9_]*) continue ;; esac
      val=$(cat "$f"; printf x); val=\${val%x}
      printf "%s='%s'\\n" "$name" "$(printf %s "$val" | sed "s/'/'\\\\\\\\''/g")" >>"$tmp"
      n=$((n + 1))
    done
    umount "$mnt"
  fi
  rmdir "$mnt"
done
mkdir -p /etc/ceamls
mv "$tmp" "$out"
echo "ceamls-env: wrote $n variables to $out"
`;

export const ENV_UNIT = `[Unit]
Description=Write /etc/ceamls/env from the project environment disks
After=local-fs.target
Before=multi-user.target

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/ceamls-env-load
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
`;

export const ENV_PROFILE = `# The project environment, written at boot by ceamls-env.service.
if [ -r /etc/ceamls/env ]; then
  set -a
  . /etc/ceamls/env
  set +a
fi
`;

export type CloudInitFile = { path: string; permissions: string; content: string };

/** The cloud-init files and commands that install the boot service. */
export const ENV_CLOUD_INIT_FILES: CloudInitFile[] = [
  { path: '/usr/local/sbin/ceamls-env-load', permissions: '0755', content: ENV_LOAD_SCRIPT },
  { path: '/etc/systemd/system/ceamls-env.service', permissions: '0644', content: ENV_UNIT },
  { path: '/etc/profile.d/ceamls-env.sh', permissions: '0644', content: ENV_PROFILE },
];

export const ENV_CLOUD_INIT_RUNCMD: string[][] = [
  ['systemctl', 'daemon-reload'],
  ['systemctl', 'enable', '--now', 'ceamls-env.service'],
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
