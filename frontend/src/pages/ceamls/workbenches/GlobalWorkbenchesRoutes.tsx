import * as React from 'react';
import { Navigate, Route } from 'react-router-dom';
import ProjectsRoutes from '#~/concepts/projects/ProjectsRoutes';
import NotebookList from '#~/pages/projects/screens/detail/notebooks/NotebookList';
import SpawnerPage from '#~/pages/projects/screens/spawner/SpawnerPage';
import EditSpawnerPage from '#~/pages/projects/screens/spawner/EditSpawnerPage';
import ProjectScopedLoader from '#~/pages/ceamls/ProjectScopedLoader';
import ProjectScopedPage from '#~/pages/ceamls/ProjectScopedPage';
import { globNamespaceAll, workbenchesRoute } from '#~/pages/ceamls/routes';
import {
  WorkbenchPathsContext,
  workbenchesPageWorkbenchPaths,
} from '#~/pages/ceamls/WorkbenchPathsContext';

const title = 'Workbenches';
const description =
  'Create and manage workbenches: development environments, such as JupyterLab, that run in a project.';

// Create and edit are mounted here too, so the sidebar keeps Workbenches
// selected and the spawner returns to this page (WorkbenchPathsContext).
const GlobalWorkbenchesRoutes: React.FC = () => (
  <WorkbenchPathsContext.Provider value={workbenchesPageWorkbenchPaths}>
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
        <Route path="spawner" element={<SpawnerPage />} />
        <Route path="spawner/:notebookName" element={<EditSpawnerPage />} />
        <Route path="*" element={<Navigate to="." />} />
      </Route>
    </ProjectsRoutes>
  </WorkbenchPathsContext.Provider>
);

export default GlobalWorkbenchesRoutes;
