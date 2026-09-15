import * as React from 'react';
import { Navigate, Route } from 'react-router-dom';
import ProjectsRoutes from '#~/concepts/projects/ProjectsRoutes';
import NotebookList from '#~/pages/projects/screens/detail/notebooks/NotebookList';
import ProjectScopedLoader from '#~/pages/ceamls/ProjectScopedLoader';
import ProjectScopedPage from '#~/pages/ceamls/ProjectScopedPage';
import { globNamespaceAll, workbenchesRoute } from '#~/pages/ceamls/routes';

const title = 'Workbenches';
const description =
  'Create and manage workbenches: development environments, such as JupyterLab, that run in a project.';

const GlobalWorkbenchesRoutes: React.FC = () => (
  <ProjectsRoutes>
    <Route
      path={globNamespaceAll}
      element={
        <ProjectScopedLoader
          title={title}
          description={description}
          noProjectsBody="To create a workbench, first create a project."
          getRedirectPath={workbenchesRoute}
        />
      }
    >
      <Route
        index
        element={
          <ProjectScopedPage
            title={title}
            description={description}
            getRedirectPath={workbenchesRoute}
          >
            <NotebookList showTitle={false} />
          </ProjectScopedPage>
        }
      />
      <Route path="*" element={<Navigate to="." />} />
    </Route>
  </ProjectsRoutes>
);

export default GlobalWorkbenchesRoutes;
