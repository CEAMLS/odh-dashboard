// CEAMLS: the data of the project Overview tab. The quota and the pods
// come from the cluster as the signed-in person. The people and the
// dates come from the project page API (api.ts).
import * as React from 'react';
import { groupVersionKind } from '#~/api/k8sUtils';
import { PodModel } from '#~/api/models';
import useK8sWatchResourceList from '#~/utilities/useK8sWatchResourceList';
import { toApiError } from '#~/pages/ceamls/buckets/api';
import type { ApiError } from '#~/pages/ceamls/buckets/api';
import { ResourceQuotaModel } from '#~/pages/ceamls/vms/models';
import type { ResourceQuotaKind } from '#~/pages/ceamls/vms/types';
import { getProjectPage } from './api';
import type { ProjectPage } from './api';
import { quotaRows, workloads } from './logic';
import type { PodLite, QuotaRow, Workload } from './logic';

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
  return React.useMemo(() => {
    const hard: Record<string, string> = {};
    const used: Record<string, string> = {};
    quotas.forEach((q) => {
      Object.assign(hard, q.status?.hard);
      Object.assign(used, q.status?.used);
    });
    return {
      loaded,
      rows: quotaRows(hard, used),
      error: error instanceof Error ? error : undefined,
    };
  }, [quotas, loaded, error]);
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
