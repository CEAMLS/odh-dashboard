// CEAMLS: the Volumes page lived at /storage until 2026-11-07. Old links
// and bookmarks land here and go on to /storage/volumes.
import * as React from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { storageRootPath } from '#~/pages/ceamls/routes';

const LegacyStorageRedirect: React.FC = () => {
  const { '*': rest = '' } = useParams();
  return <Navigate to={rest ? `${storageRootPath}/${rest}` : storageRootPath} replace />;
};

export default LegacyStorageRedirect;
