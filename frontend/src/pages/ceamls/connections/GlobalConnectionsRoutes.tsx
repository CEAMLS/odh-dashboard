// CEAMLS: the Connections page, one project at a time, under
// Secrets and connections. /connections/<project> lists the connections
// of the project. The project page has no Connections tab.
// Plan: planning/hub_pages.md section 3.6 in the cluster repo.
import * as React from 'react';
import { Navigate, Route } from 'react-router-dom';
import ProjectsRoutes from '@odh-dashboard/ui-core/components/ProjectsRoutes';
import ConnectionsList from '#~/pages/projects/screens/detail/connections/ConnectionsList';
import ProjectScopedLoader from '#~/pages/ceamls/ProjectScopedLoader';
import ProjectScopedPage from '#~/pages/ceamls/ProjectScopedPage';
import { connectionsRoute, globNamespaceAll } from '#~/pages/ceamls/routes';

const title = 'Connections';
const description =
  'A connection is a named set of values for one outside system, such as an S3 bucket or a model registry. You attach a connection to the thing that uses it: a workbench, a model deployment or a pipeline server. A value that every workbench and VM of the project must get belongs in Secrets and variables.';

const GlobalConnectionsRoutes: React.FC = () => (
  <ProjectsRoutes>
    <Route
      path={globNamespaceAll}
      element={
        <ProjectScopedLoader
          title={title}
          description={description}
          noProjectsBody="To add a connection, first create a project."
          getRedirectPath={connectionsRoute}
        />
      }
    >
      <Route
        index
        element={
          <ProjectScopedPage
            title={title}
            description={description}
            getRedirectPath={connectionsRoute}
          >
            <ConnectionsList showTitle={false} />
          </ProjectScopedPage>
        }
      />
      <Route path="*" element={<Navigate to="." />} />
    </Route>
  </ProjectsRoutes>
);

export default GlobalConnectionsRoutes;
