// CEAMLS: the Gateway page fetches the model list once and hands it to its
// tabs through this context, so a tab switch does not call the backend again.
// useMergedModels reads it; outside the Gateway page the hook fetches on its own.
import * as React from 'react';
import { FetchStateObject } from 'mod-arch-core';
import { AIModel } from '~/app/types';

export const AIAssetsModelsContext = React.createContext<FetchStateObject<AIModel[]> | undefined>(
  undefined,
);
