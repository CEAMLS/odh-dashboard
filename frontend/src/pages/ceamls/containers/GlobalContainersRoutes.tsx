// CEAMLS: the System containers pages, project scoped like Virtual machines:
// /system-containers/<project>, .../create and .../<name>. A trial for
// administrators; the route extension carries the administrator flag.
import * as React from 'react';
import { Navigate, Route } from 'react-router-dom';
import ProjectsRoutes from '@odh-dashboard/ui-core/components/ProjectsRoutes';
import ProjectScopedLoader from '#~/pages/ceamls/ProjectScopedLoader';
import { containersRoute, globNamespaceAll } from '#~/pages/ceamls/routes';
import ContainersPage, { containersDescription, containersTitle } from './ContainersPage';
import CreateContainerPage from './CreateContainerPage';
import ContainerPage from './ContainerPage';

const GlobalContainersRoutes: React.FC = () => (
  <ProjectsRoutes>
    <Route
      path={globNamespaceAll}
      element={
        <ProjectScopedLoader
          title={containersTitle}
          description={containersDescription}
          noProjectsBody="To create a system container, first create a project."
          getRedirectPath={containersRoute}
        />
      }
    >
      <Route index element={<ContainersPage />} />
      <Route path="create" element={<CreateContainerPage />} />
      <Route path=":name" element={<ContainerPage />} />
      <Route path="*" element={<Navigate to="." />} />
    </Route>
  </ProjectsRoutes>
);

export default GlobalContainersRoutes;
