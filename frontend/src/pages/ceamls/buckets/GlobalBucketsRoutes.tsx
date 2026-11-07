// CEAMLS: the Buckets pages, one project at a time, under Storage in the
// sidebar. /storage/buckets/<project> lists the buckets and the keys;
// /storage/buckets/<project>/<bucket> browses one bucket.
import * as React from 'react';
import { Navigate, Route } from 'react-router-dom';
import ProjectsRoutes from '@odh-dashboard/ui-core/components/ProjectsRoutes';
import ProjectScopedLoader from '#~/pages/ceamls/ProjectScopedLoader';
import { bucketsRoute, globNamespaceAll } from '#~/pages/ceamls/routes';
import BucketsPage, { bucketsDescription, bucketsTitle } from './BucketsPage';
import ObjectsPage from './ObjectsPage';

const GlobalBucketsRoutes: React.FC = () => (
  <ProjectsRoutes>
    <Route
      path={globNamespaceAll}
      element={
        <ProjectScopedLoader
          title={bucketsTitle}
          description={bucketsDescription}
          noProjectsBody="To use buckets, first create a project."
          getRedirectPath={bucketsRoute}
        />
      }
    >
      <Route index element={<BucketsPage />} />
      <Route path=":bucket" element={<ObjectsPage />} />
      <Route path="*" element={<Navigate to="." />} />
    </Route>
  </ProjectsRoutes>
);

export default GlobalBucketsRoutes;
