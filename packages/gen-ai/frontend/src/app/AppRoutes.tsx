import * as React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import ChatbotPage from '~/app/Chatbot/ChatbotPage';
import { AIAssetsPage } from '~/app/AIAssets/AIAssetsPage';
import ApiPlaygroundPage from '~/app/ApiPlayground/ApiPlaygroundPage';
import { NotFound } from '~/app/EmptyStates/NotFound';
import { NavDataItem } from '~/app/standalone/types';
import GenAiCoreLoader from '~/app/GenAiCoreLoader';
import PlaygroundIcon from '~/app/images/icons/PlaygroundIcon';
import AiAssetEndpointsIcon from '~/app/images/icons/AiAssetEndpointsIcon';
import {
  chatPlaygroundRootPath,
  genAiAiAssetsRoute,
  genAiApiPlaygroundRoute,
  genAiChatPlaygroundRoute,
  aiAssetsRootPath,
  apiPlaygroundRootPath,
  globChatPlaygroundAll,
  globAiAssetsAll,
  globApiPlaygroundAll,
} from '~/app/utilities/routes';

export interface IAppRoute {
  label?: string; // Excluding the label will exclude the route from the nav sidebar in AppLayout
  element: React.ReactElement;
  exact?: boolean;
  path: string;
  title: string;
  routes?: undefined;
}

export interface IAppRouteGroup {
  label: string;
  routes: IAppRoute[];
}

export type AppRouteConfig = IAppRoute | IAppRouteGroup;

export const useNavData = (): NavDataItem[] => [
  {
    label: 'Gen AI V3',
    children: [
      {
        label: 'Playground',
        path: globChatPlaygroundAll,
        href: chatPlaygroundRootPath,
      },
      {
        label: 'Gateway',
        path: globAiAssetsAll,
        href: aiAssetsRootPath,
      },
      {
        label: 'API playground',
        path: globApiPlaygroundAll,
        href: apiPlaygroundRootPath,
      },
    ],
  },
];

const AppRoutes = (): React.ReactElement => (
  <Routes>
    <Route path="/" element={<Navigate to={chatPlaygroundRootPath} replace />} />
    <Route
      path="/playground"
      element={
        <GenAiCoreLoader
          title="Playground"
          icon={PlaygroundIcon}
          getInvalidRedirectPath={genAiChatPlaygroundRoute}
        />
      }
    >
      <Route path=":namespace" element={<ChatbotPage />} />
    </Route>
    <Route
      path="/assets"
      element={
        <GenAiCoreLoader
          title="Gateway"
          icon={AiAssetEndpointsIcon}
          getInvalidRedirectPath={genAiAiAssetsRoute}
        />
      }
    >
      <Route path=":namespace" element={<AIAssetsPage />} />
      <Route path=":namespace/:tab" element={<AIAssetsPage />} />
    </Route>
    <Route
      path="/api-playground"
      element={
        <GenAiCoreLoader
          title="Playground"
          icon={PlaygroundIcon}
          getInvalidRedirectPath={genAiApiPlaygroundRoute}
        />
      }
    >
      <Route path=":namespace" element={<ApiPlaygroundPage />} />
    </Route>
    <Route path="*" element={<NotFound />} />
  </Routes>
);

export { AppRoutes };
