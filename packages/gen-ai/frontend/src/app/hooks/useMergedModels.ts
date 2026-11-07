import * as React from 'react';
import { AIModel } from '~/app/types';
import { AIAssetsModelsContext } from '~/app/AIAssets/AIAssetsModelsContext';
import useFetchAIModels from './useFetchAIModels';

type UseMergedModelsResult = {
  models: AIModel[];
  loaded: boolean;
  error: Error | undefined;
  refresh: () => void;
};

const useMergedModels = (): UseMergedModelsResult => {
  // CEAMLS: inside the Gateway page the list comes from the page; the hook's
  // own fetch is skipped so the backend is called once per page, not per tab.
  const shared = React.useContext(AIAssetsModelsContext);
  const own = useFetchAIModels(!!shared);
  const { data: models = [], loaded, error, refresh } = shared ?? own;

  return {
    models,
    loaded: loaded || !!error,
    error,
    refresh,
  };
};

export default useMergedModels;
