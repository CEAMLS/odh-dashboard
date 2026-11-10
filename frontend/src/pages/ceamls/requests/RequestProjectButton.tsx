// CEAMLS: the Request a project button of the Projects page, for every
// signed-in person. It replaced the stock Create project button
// (2026-11-10): projects come from CEAMLS Cluster Admin, where the admin
// creates one from the request with its quota and its people.
import * as React from 'react';
import { Button } from '@patternfly/react-core';
import { ProjectRequestsContext } from './ProjectRequestsContext';
import RequestProjectModal from './RequestProjectModal';

const RequestProjectButton: React.FC = () => {
  const [open, setOpen] = React.useState(false);
  const { data, refresh } = React.useContext(ProjectRequestsContext);
  return (
    <>
      <Button data-testid="ceamls-request-project" variant="primary" onClick={() => setOpen(true)}>
        Request a project
      </Button>
      {open && <RequestProjectModal me={data} onSent={refresh} onClose={() => setOpen(false)} />}
    </>
  );
};

export default RequestProjectButton;
