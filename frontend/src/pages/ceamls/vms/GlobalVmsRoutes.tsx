// CEAMLS: the Virtual machines pages, project scoped like Workbenches and
// Volumes: /vms/<project>, /vms/<project>/create, /vms/<project>/<name>, and /vms/<project>/<name>/console for a tab of its own.
import * as React from 'react';
import { Navigate, Route } from 'react-router-dom';
import ProjectsRoutes from '@odh-dashboard/ui-core/components/ProjectsRoutes';
import ProjectScopedLoader from '#~/pages/ceamls/ProjectScopedLoader';
import { globNamespaceAll, vmsRoute } from '#~/pages/ceamls/routes';
import VmsPage, { vmsDescription, vmsTitle } from './VmsPage';
import CreateVmPage from './CreateVmPage';
import VmPage from './VmPage';
import VmConsolePage from './VmConsolePage';

const GlobalVmsRoutes: React.FC = () => (
  <ProjectsRoutes>
    <Route
      path={globNamespaceAll}
      element={
        <ProjectScopedLoader
          title={vmsTitle}
          description={vmsDescription}
          noProjectsBody="To create a virtual machine, first create a project."
          getRedirectPath={vmsRoute}
        />
      }
    >
      <Route index element={<VmsPage />} />
      <Route path="create" element={<CreateVmPage />} />
      <Route path=":name" element={<VmPage />} />
      <Route path=":name/console" element={<VmConsolePage />} />
      <Route path="*" element={<Navigate to="." />} />
    </Route>
  </ProjectsRoutes>
);

export default GlobalVmsRoutes;
