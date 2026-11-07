import * as React from 'react';
import { Navigate, Route } from 'react-router-dom';
import ProjectsRoutes from '@odh-dashboard/ui-core/components/ProjectsRoutes';
import StorageList from '#~/pages/projects/screens/detail/storage/StorageList';
import ProjectScopedLoader from '#~/pages/ceamls/ProjectScopedLoader';
import ProjectScopedPage from '#~/pages/ceamls/ProjectScopedPage';
import { globNamespaceAll, storageRoute } from '#~/pages/ceamls/routes';

// CEAMLS: "Volumes" is the researcher word for the project's persistent
// volumes (the docs: "a disk that a workbench or a VM keeps across a stop
// and a start"). Upstream calls them cluster storage.
const title = 'Volumes';
const description =
  'Volumes keep a project’s data across a stop and a start. Attach a volume to a workbench to use it there.';

const GlobalStorageRoutes: React.FC = () => (
  <ProjectsRoutes>
    <Route
      path={globNamespaceAll}
      element={
        <ProjectScopedLoader
          title={title}
          description={description}
          noProjectsBody="To add a volume, first create a project."
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
