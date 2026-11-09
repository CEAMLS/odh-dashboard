// CEAMLS: the data behind the Secrets and variables page. The page reads and
// writes the two objects of the project environment through the hub's
// cluster API proxy as the signed-in person; RBAC decides what each call may
// do. Plan: planning/hub_pages.md section 3.6 in the cluster repo.
import * as React from 'react';
import {
  k8sCreateResource,
  k8sGetResource,
  k8sUpdateResource,
  useK8sWatchResource,
} from '@openshift/dynamic-plugin-sdk-utils';
import type { K8sResourceCommon, WatchK8sResult } from '@openshift/dynamic-plugin-sdk-utils';
import { isK8sStatus } from '@odh-dashboard/k8s-core';
import type { ConfigMapKind, SecretKind } from '@odh-dashboard/k8s-core';
import { ConfigMapModel, SecretModel } from '@odh-dashboard/k8s-core/api/models';
import { groupVersionKind } from '#~/api/k8sUtils';
import { ProjectDetailsContext } from '#~/pages/projects/ProjectDetailsContext';
import { useVms } from '#~/pages/ceamls/vms/api';
import { vmLoadsEnv } from '#~/pages/ceamls/vms/envVolumes';
import {
  ENV_CONFIGMAP,
  ENV_SECRET,
  LABEL,
  META_ANNOTATION,
  decodeValue,
  hasProjectEnv,
  parseMeta,
} from './envUtils';
import type { EnvVar, VarMeta } from './envUtils';

/** The SDK gives `{}` or `null` for a single object before it arrives; that is "absent". */
const named = (x: unknown): boolean => {
  if (typeof x !== 'object' || x === null) {
    return false;
  }
  const meta: unknown = Reflect.get(x, 'metadata');
  return typeof meta === 'object' && meta !== null && typeof Reflect.get(meta, 'name') === 'string';
};

const present = <T extends K8sResourceCommon>(
  result: WatchK8sResult<T>,
): [T | undefined, boolean, unknown] => {
  const [data, loaded, error] = result;
  return [named(data) ? data : undefined, loaded, error];
};

const statusCode = (e: unknown): unknown => {
  if (typeof e !== 'object' || e === null) {
    return undefined;
  }
  const status: unknown = Reflect.get(e, 'statusObject');
  return typeof status === 'object' && status !== null ? Reflect.get(status, 'code') : undefined;
};

const notFound = (e: unknown): boolean =>
  (isK8sStatus(e) && e.code === 404) ||
  statusCode(e) === 404 ||
  (e instanceof Error && /not found/i.test(e.message));

/** The watch on one of the two objects: undefined before it exists or while it loads. */
const useEnvObject = <T extends K8sResourceCommon>(
  ns: string,
  model: typeof ConfigMapModel,
  name: string,
): [T | undefined, boolean, unknown] =>
  present(
    useK8sWatchResource<T>(
      React.useMemo(
        () => ({
          isList: false,
          groupVersionKind: groupVersionKind(model),
          namespace: ns,
          name,
        }),
        [ns, model, name],
      ),
      model,
    ),
  );

export type ProjectEnv = {
  vars: EnvVar[];
  /** True once both watches answered (an absent object counts as answered). */
  loaded: boolean;
  /** The first error that is not "not found". */
  error: Error | undefined;
};

const asError = (e: unknown): Error | undefined => {
  if (!e || notFound(e)) {
    return undefined;
  }
  return e instanceof Error ? e : new Error(String(e));
};

/** The project environment, watched: every variable of both objects, sorted by name. */
export const useProjectEnv = (ns: string): ProjectEnv => {
  const [cm, cmLoaded, cmError] = useEnvObject<ConfigMapKind>(ns, ConfigMapModel, ENV_CONFIGMAP);
  const [secret, secretLoaded, secretError] = useEnvObject<SecretKind>(ns, SecretModel, ENV_SECRET);
  return React.useMemo(() => {
    const vars: EnvVar[] = [];
    const cmMeta = parseMeta(cm?.metadata.annotations?.[META_ANNOTATION]);
    Object.entries(cm?.data ?? {}).forEach(([name, value]) => {
      vars.push({ name, value, secret: false, ...cmMeta[name] });
    });
    const secretMeta = parseMeta(secret?.metadata.annotations?.[META_ANNOTATION]);
    Object.entries(secret?.data ?? {}).forEach(([name, value]) => {
      vars.push({ name, value: decodeValue(value), secret: true, ...secretMeta[name] });
    });
    // A watch on an absent object reports a 404 and stays "not loaded"; that is "empty".
    const loaded = (cmLoaded || !!cmError) && (secretLoaded || !!secretError);
    return {
      vars: vars.toSorted((a, b) => a.name.localeCompare(b.name)),
      loaded,
      error: asError(cmError) ?? asError(secretError),
    };
  }, [cm, cmLoaded, cmError, secret, secretLoaded, secretError]);
};

// -- writes ------------------------------------------------------------------

type Change = { name: string; value: string; secret: boolean };

const labels = (ns: string): Record<string, string> => ({
  [`${LABEL}project`]: ns,
  [`${LABEL}purpose`]: 'env',
});

const utf8ToBase64 = (s: string): string => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin);
};

/** Read one object; undefined when it does not exist. */
const getObject = async <T extends K8sResourceCommon>(
  model: typeof ConfigMapModel,
  ns: string,
  name: string,
): Promise<T | undefined> => {
  try {
    return await k8sGetResource<T>({ model, queryOptions: { ns, name } });
  } catch (e) {
    if (notFound(e)) {
      return undefined;
    }
    throw e;
  }
};

/**
 * Set or remove keys on one object: a read then an update when it exists,
 * a create when it does not (the pattern of the VM pages' keys Secret).
 * `values[name] === null` removes the key. The meta annotation records who
 * changed each key and when.
 */
const writeObject = async (
  model: typeof ConfigMapModel,
  ns: string,
  name: string,
  values: Record<string, string | null>,
  by: string,
): Promise<void> => {
  const isSecret = model === SecretModel;
  const existing = await getObject<ConfigMapKind | SecretKind>(model, ns, name);
  const meta = parseMeta(existing?.metadata.annotations?.[META_ANNOTATION]);
  const now = new Date().toISOString();
  const data: Record<string, string> = { ...(existing?.data ?? {}) };
  Object.entries(values).forEach(([k, v]) => {
    if (v === null) {
      delete meta[k];
      delete data[k];
    } else {
      meta[k] = { by, at: now };
      data[k] = isSecret ? utf8ToBase64(v) : v;
    }
  });
  const annotations = {
    ...(existing?.metadata.annotations ?? {}),
    [META_ANNOTATION]: JSON.stringify(meta),
  };
  if (!existing) {
    if (Object.keys(data).length === 0) {
      return;
    }
    await k8sCreateResource({
      model,
      resource: {
        apiVersion: 'v1',
        kind: model.kind,
        metadata: { name, namespace: ns, labels: labels(ns), annotations },
        ...(isSecret ? { type: 'Opaque' } : {}),
        data,
      },
    });
    return;
  }
  await k8sUpdateResource({
    model,
    resource: {
      ...existing,
      metadata: {
        ...existing.metadata,
        labels: { ...(existing.metadata.labels ?? {}), ...labels(ns) },
        annotations,
      },
      data,
    },
  });
};

/**
 * Set variables. A name that moves between secret and variable is removed
 * from the other object, so a name lives in one place only.
 */
export const setVariables = async (
  ns: string,
  changes: Change[],
  by: string,
  existing: EnvVar[],
): Promise<void> => {
  const toSecret: Record<string, string | null> = {};
  const toConfig: Record<string, string | null> = {};
  changes.forEach((c) => {
    (c.secret ? toSecret : toConfig)[c.name] = c.value;
    const was = existing.find((v) => v.name === c.name);
    if (was && was.secret !== c.secret) {
      (was.secret ? toSecret : toConfig)[c.name] = null;
    }
  });
  if (Object.keys(toSecret).length > 0) {
    await writeObject(SecretModel, ns, ENV_SECRET, toSecret, by);
  }
  if (Object.keys(toConfig).length > 0) {
    await writeObject(ConfigMapModel, ns, ENV_CONFIGMAP, toConfig, by);
  }
};

export const removeVariable = async (ns: string, v: EnvVar, by: string): Promise<void> => {
  if (v.secret) {
    await writeObject(SecretModel, ns, ENV_SECRET, { [v.name]: null }, by);
  } else {
    await writeObject(ConfigMapModel, ns, ENV_CONFIGMAP, { [v.name]: null }, by);
  }
};

// -- who loads it -------------------------------------------------------------

export type Loaders = { workbenches: number; vms: number; loaded: boolean };

/** How many workbenches and VMs of the project load the environment. */
export const useLoaders = (ns: string): Loaders => {
  const { notebooks } = React.useContext(ProjectDetailsContext);
  const [vms, vmsLoaded] = useVms(ns);
  return React.useMemo(
    () => ({
      workbenches: notebooks.data.filter((n) =>
        n.notebook.spec.template.spec.containers.some((c) => hasProjectEnv(c.envFrom)),
      ).length,
      vms: vms.filter(vmLoadsEnv).length,
      loaded: notebooks.loaded && vmsLoaded,
    }),
    [notebooks.data, notebooks.loaded, vms, vmsLoaded],
  );
};

export const loadersText = (l: Loaders): string => {
  const w = `${l.workbenches} ${l.workbenches === 1 ? 'workbench' : 'workbenches'}`;
  const v = `${l.vms} ${l.vms === 1 ? 'VM' : 'VMs'}`;
  return `${w} and ${v}`;
};

export type { VarMeta };
