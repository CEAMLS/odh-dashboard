import * as React from 'react';
import { Navigate, Route } from 'react-router-dom';
import ProjectsRoutes from '#~/concepts/projects/ProjectsRoutes';
import StorageList from '#~/pages/projects/screens/detail/storage/StorageList';
import ProjectScopedLoader from '#~/pages/ceamls/ProjectScopedLoader';
import ProjectScopedPage from '#~/pages/ceamls/ProjectScopedPage';
import { globNamespaceAll, storageRoute } from '#~/pages/ceamls/routes';

const title = 'Storage';
const description =
  'Manage cluster storage: persistent volumes that keep a project’s data and can be attached to workbenches.';

const GlobalStorageRoutes: React.FC = () => (
  <ProjectsRoutes>
    <Route
      path={globNamespaceAll}
      element={
        <ProjectScopedLoader
          title={title}
          description={description}
          noProjectsBody="To add cluster storage, first create a project."
          getRedirectPath={storageRoute}
        />
      }
    >
      <Route
        index
        element={
          <ProjectScopedPage title={title} description={description} getRedirectPath={storageRoute}>
            <StorageList showTitle={false} />
          </ProjectScopedPage>
        }
      />
      <Route path="*" element={<Navigate to="." />} />
    </Route>
  </ProjectsRoutes>
);

export default GlobalStorageRoutes;
