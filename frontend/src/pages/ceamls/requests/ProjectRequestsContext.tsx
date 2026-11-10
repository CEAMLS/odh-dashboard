// CEAMLS: the signed-in person's project requests, read once for the
// Projects page and shared by the Request a project button and the list
// of requests under it.
import * as React from 'react';
import { toApiError } from '#~/pages/ceamls/buckets/api';
import { getMyRequests } from './api';
import type { MyRequests } from './api';

type Value = {
  data?: MyRequests;
  error?: Error;
  loaded: boolean;
  refresh: () => void;
};

export const ProjectRequestsContext = React.createContext<Value>({
  loaded: false,
  refresh: () => undefined,
});

export const ProjectRequestsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [data, setData] = React.useState<MyRequests>();
  const [error, setError] = React.useState<Error>();
  const [loaded, setLoaded] = React.useState(false);
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    let live = true;
    getMyRequests()
      .then((out) => {
        if (live) {
          setData(out);
          setError(undefined);
        }
      })
      .catch((e: unknown) => live && setError(toApiError(e)))
      .finally(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, [tick]);
  const refresh = React.useCallback(() => setTick((t) => t + 1), []);
  const value = React.useMemo(
    () => ({ data, error, loaded, refresh }),
    [data, error, loaded, refresh],
  );
  return (
    <ProjectRequestsContext.Provider value={value}>{children}</ProjectRequestsContext.Provider>
  );
};
