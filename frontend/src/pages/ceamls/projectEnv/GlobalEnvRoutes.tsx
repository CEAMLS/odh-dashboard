// CEAMLS: the Secrets and variables page, one project at a time, under
// Secrets and connections.
// /env/<project> lists the project environment.
import * as React from 'react';
import { Navigate, Route } from 'react-router-dom';
import ProjectsRoutes from '@odh-dashboard/ui-core/components/ProjectsRoutes';
import ProjectScopedLoader from '#~/pages/ceamls/ProjectScopedLoader';
import { envRoute, globNamespaceAll } from '#~/pages/ceamls/routes';
import EnvPage, { envDescription, envTitle } from './EnvPage';

const GlobalEnvRoutes: React.FC = () => (
  <ProjectsRoutes>
    <Route
      path={globNamespaceAll}
      element={
        <ProjectScopedLoader
          title={envTitle}
          description={envDescription}
          noProjectsBody="To add secrets and variables, first create a project."
          getRedirectPath={envRoute}
        />
      }
    >
      <Route index element={<EnvPage />} />
      <Route path="*" element={<Navigate to="." />} />
    </Route>
  </ProjectsRoutes>
);

export default GlobalEnvRoutes;
