// CEAMLS: the data of the project Overview tab. The quota and the pods
// come from the cluster as the signed-in person. The people and the
// dates come from the project page API (api.ts). The object storage
// numbers come from the storage API.
import * as React from 'react';
import { groupVersionKind } from '#~/api/k8sUtils';
import { PodModel } from '#~/api/models';
import useK8sWatchResourceList from '#~/utilities/useK8sWatchResourceList';
import { listBuckets, listProjects, toApiError } from '#~/pages/ceamls/buckets/api';
import type { ApiError } from '#~/pages/ceamls/buckets/api';
import { memoryBytesOf } from '#~/pages/ceamls/vms/api';
import { ResourceQuotaModel } from '#~/pages/ceamls/vms/models';
import type { ResourceQuotaKind } from '#~/pages/ceamls/vms/types';
import { getProjectPage } from './api';
import type { ProjectPage } from './api';
import { quotaRows, workloads } from './logic';
import type { ObjectStorage, PodLite, QuotaRow, Workload } from './logic';

export type ProjectPageState = {
  loaded: boolean;
  page?: ProjectPage;
  /** The project is not a research project: it has no PI and no people list. */
  shared: boolean;
  error?: ApiError;
  reload: () => void;
};

export const useProjectPage = (ns: string): ProjectPageState => {
  const [state, setState] = React.useState<Omit<ProjectPageState, 'reload'>>({
    loaded: false,
    shared: false,
  });
  const [turn, setTurn] = React.useState(0);
  React.useEffect(() => {
    let live = true;
    getProjectPage(ns)
      .then((page) => live && setState({ loaded: true, page, shared: false }))
      .catch((e: unknown) => {
        if (!live) {
          return;
        }
        const error = toApiError(e);
        // 404: a shared project, declared in the cluster repository.
        setState(
          error.status === 404
            ? { loaded: true, shared: true }
            : { loaded: true, shared: false, error },
        );
      });
    return () => {
      live = false;
    };
  }, [ns, turn]);
  const reload = React.useCallback(() => setTurn((t) => t + 1), []);
  return { ...state, reload };
};

const useObjectStorage = (ns: string): ObjectStorage | undefined => {
  const [value, setValue] = React.useState<ObjectStorage>();
  React.useEffect(() => {
    let live = true;
    setValue(undefined);
    listProjects()
      .then(async ({ projects }) => {
        const cap = projects.find((p) => p.name === ns)?.cap;
        const capBytes = cap ? memoryBytesOf(cap) : 0;
        if (!capBytes) {
          return { known: true as const, capBytes: 0, usedBytes: 0 };
        }
        const { buckets } = await listBuckets(ns);
        return {
          known: true as const,
          capBytes,
          usedBytes: buckets.reduce((sum, b) => sum + (b.usage?.bytes ?? 0), 0),
        };
      })
      .then((v) => live && setValue(v))
      .catch(() => live && setValue({ known: false }));
    return () => {
      live = false;
    };
  }, [ns]);
  return value;
};

export type QuotaState = { loaded: boolean; rows: QuotaRow[]; error?: Error };

export const useQuotaRows = (ns: string): QuotaState => {
  const [quotas, loaded, error] = useK8sWatchResourceList<ResourceQuotaKind[]>(
    React.useMemo(
      () => ({
        isList: true,
        groupVersionKind: groupVersionKind(ResourceQuotaModel),
        namespace: ns,
      }),
      [ns],
    ),
    ResourceQuotaModel,
  );
  const object = useObjectStorage(ns);
  return React.useMemo(() => {
    const hard: Record<string, string> = {};
    const used: Record<string, string> = {};
    quotas.forEach((q) => {
      Object.assign(hard, q.status?.hard);
      Object.assign(used, q.status?.used);
    });
    return {
      loaded: loaded && object !== undefined,
      rows: quotaRows(hard, used, object ?? { known: false }),
      error: error instanceof Error ? error : undefined,
    };
  }, [quotas, loaded, error, object]);
};

export const useWorkloads = (ns: string): { loaded: boolean; rows: Workload[]; error?: Error } => {
  const [pods, loaded, error] = useK8sWatchResourceList<PodLite[]>(
    React.useMemo(
      () => ({ isList: true, groupVersionKind: groupVersionKind(PodModel), namespace: ns }),
      [ns],
    ),
    PodModel,
  );
  return React.useMemo(
    () => ({ loaded, rows: workloads(pods), error: error instanceof Error ? error : undefined }),
    [pods, loaded, error],
  );
};
