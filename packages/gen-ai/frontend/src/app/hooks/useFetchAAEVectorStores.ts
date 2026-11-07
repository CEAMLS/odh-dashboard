import * as React from 'react';
import {
  FetchStateCallbackPromise,
  FetchStateObject,
  NotReadyError,
  useFetchState,
} from 'mod-arch-core';
import { ExternalVectorStoreSummary } from '~/app/types';
import { useGenAiAPI } from './useGenAiAPI';

// CEAMLS: `enabled=false` answers an empty, loaded list without a request. The
// models table passes the external vector stores feature flag, so a cluster
// that has the feature off does not call the backend for it.
const useFetchAAEVectorStores = (
  enabled = true,
): FetchStateObject<ExternalVectorStoreSummary[]> => {
  const { api, apiAvailable } = useGenAiAPI();

  const fetchVectorStores = React.useCallback<
    FetchStateCallbackPromise<ExternalVectorStoreSummary[]>
  >(async () => {
    if (!enabled) {
      return [];
    }
    if (!apiAvailable) {
      return Promise.reject(new NotReadyError('API not yet available'));
    }
    const stores = await api.getAAVectorStores();
    return Array.isArray(stores) ? stores : [];
  }, [api, apiAvailable, enabled]);

  const [data, loaded, error, refresh] = useFetchState(fetchVectorStores, [], {
    initialPromisePurity: true,
  });
  return { data, loaded, error, refresh };
};

export default useFetchAAEVectorStores;
