import * as React from 'react';
import useFetch, {
  AdHocUpdate,
  FetchOptions,
  FetchStateObject,
  FetchStateCallbackPromiseAdHoc,
  NotReadyError,
} from '@odh-dashboard/ui-core/hooks/useFetch';
import { getNotebook, getNotebooks, groupVersionKind, NotebookModel } from '#~/api';
import { NotebookKind } from '#~/k8sTypes';
import useK8sWatchResourceList from '#~/utilities/useK8sWatchResourceList';
import { NotebookDataState, NotebookState } from './types';
import { getNotebooksStatus, getNotebookStatus } from './service';

const refreshNotebookState = (
  notebookName: string,
  namespace: string,
): Promise<NotebookDataState | void> =>
  new Promise((resolve, reject) => {
    getNotebook(notebookName, namespace)
      .then((notebook) => {
        // Have a notebook, get a proper status of it
        getNotebookStatus(notebook)
          .then((notebookStatus) => {
            resolve(notebookStatus);
          })
          .catch(reject);
      })
      .catch(reject);
  });

export const getNotebooksStates = (
  notebooks: NotebookKind[],
  namespace: string,
): Promise<AdHocUpdate<NotebookState[]>> =>
  getNotebooksStatus(notebooks).then((state) => {
    const adhocUpdate: AdHocUpdate<NotebookState[]> = (lazySetState) => {
      // Save and overwrite everything immediately
      lazySetState(() =>
        state.map((currentState) => {
          // Setup each one to be able to refresh later
          const refresh = () => {
            const notebookName = currentState.notebook.metadata.name;
            return refreshNotebookState(notebookName, namespace).then((newState) => {
              lazySetState((notebookStates) => {
                if (newState) {
                  // Replace just the object that got refreshed
                  return notebookStates.map((s) =>
                    s.notebook.metadata.name === notebookName ? { ...newState, refresh } : s,
                  );
                }

                // For some reason, we didn't get one back -- remove it from the list
                return notebookStates.filter((s) => s.notebook.metadata.name === notebookName);
              });
            });
          };

          return {
            ...currentState,
            refresh,
          };
        }),
      );
    };
    return adhocUpdate;
  });

/** How long to wait for more changes before one read (a start sends several). */
const WATCH_REFRESH_DELAY = 300;

/**
 * CEAMLS: reads the list again when a workbench of the project changes.
 *
 * The list is read on a timer (POLL_INTERVAL, 30 s). Without this, a change
 * that the cluster makes later than the click shows only at the next tick.
 * The clearest case is a delete: the object stays until its finalizers
 * finish, so the read right after the click still finds it.
 *
 * The watch only says WHEN to read. The read itself stays the same call as
 * before, so the data has one source, and a watch that fails leaves the
 * page as it was: on the timer.
 */
const useRefreshOnNotebookChange = (
  namespace: string | undefined,
  refresh: () => Promise<unknown>,
): void => {
  const watchResource = React.useMemo(
    () =>
      namespace
        ? { isList: true, groupVersionKind: groupVersionKind(NotebookModel), namespace }
        : null,
    [namespace],
  );
  const [watched, watchLoaded] = useK8sWatchResourceList<NotebookKind[]>(
    watchResource,
    NotebookModel,
  );
  // One string per state of the list: a new, changed or removed workbench
  // gives another string.
  const version = React.useMemo(
    () =>
      watched
        .map((n) => `${n.metadata.uid ?? n.metadata.name}:${n.metadata.resourceVersion ?? ''}`)
        .toSorted()
        .join(','),
    [watched],
  );
  const seenVersion = React.useRef<string | null>(null);

  // Another project: forget the list of the last one.
  React.useEffect(() => {
    seenVersion.current = null;
  }, [namespace]);

  React.useEffect(() => {
    if (!watchLoaded) {
      return undefined;
    }
    if (seenVersion.current === null) {
      // The first answer of the watch. The list was read at the same time.
      seenVersion.current = version;
      return undefined;
    }
    if (seenVersion.current === version) {
      return undefined;
    }
    const timer = setTimeout(() => {
      seenVersion.current = version;
      refresh();
    }, WATCH_REFRESH_DELAY);
    return () => clearTimeout(timer);
  }, [version, watchLoaded, refresh]);
};

const useProjectNotebookStates = (
  namespace?: string,
  fetchOptions?: Partial<FetchOptions>,
): FetchStateObject<NotebookState[]> => {
  const fetchAllNotebooks = React.useCallback<
    FetchStateCallbackPromiseAdHoc<NotebookState[]>
  >(() => {
    if (!namespace) {
      return Promise.reject(new NotReadyError('No namespace'));
    }

    return new Promise((resolve, reject) => {
      getNotebooks(namespace)
        .then((notebooks) => {
          getNotebooksStates(notebooks, namespace).then((updater) => resolve(updater));
        })
        .catch(reject);
    });
  }, [namespace]);

  const state = useFetch<NotebookState[]>(fetchAllNotebooks, [], fetchOptions);
  useRefreshOnNotebookChange(namespace, state.refresh);
  return state;
};

export default useProjectNotebookStates;
