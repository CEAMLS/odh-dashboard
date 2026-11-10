// CEAMLS: the signed-in person's project requests on the Projects page:
// what waits for an admin, and what was denied with the reason. Cancel
// takes a waiting request back; Remove clears a denied one.
import * as React from 'react';
import { Alert, Button, Content, Title } from '@patternfly/react-core';
import { toApiError } from '#~/pages/ceamls/buckets/api';
import { removeRequest } from './api';
import type { ProjectRequest } from './api';
import { ProjectRequestsContext } from './ProjectRequestsContext';
import './requests.css';

const dateOf = (iso?: string | null): string => (iso ? iso.slice(0, 10) : '');

const ProjectRequestsPanel: React.FC = () => {
  const { data, error, refresh } = React.useContext(ProjectRequestsContext);
  const [busy, setBusy] = React.useState<string>();
  const [actionError, setActionError] = React.useState<Error>();
  const requests = data?.requests ?? [];
  if (error) {
    return (
      <Alert
        variant="warning"
        isInline
        title="Your project requests could not be read"
        className="ceamls-requests"
      >
        {error.message}
      </Alert>
    );
  }
  if (requests.length === 0) {
    return null;
  }
  const act = (r: ProjectRequest) => {
    setBusy(r.id);
    setActionError(undefined);
    removeRequest(r.id)
      .then(refresh)
      .catch((e: unknown) => setActionError(toApiError(e)))
      .finally(() => setBusy(undefined));
  };
  return (
    <section className="ceamls-requests" aria-labelledby="ceamls-requests-title">
      <Title headingLevel="h2" size="md" id="ceamls-requests-title">
        Your project requests
      </Title>
      {actionError && (
        <Alert variant="danger" isInline title="The request could not be removed">
          {actionError.message}
        </Alert>
      )}
      {requests.map((r) => (
        <div className="ceamls-request" key={r.id} data-testid="ceamls-request">
          <div>
            <div className="ceamls-request-title">
              {r.title} <Content component="small">{r.name}</Content>
            </div>
            <Content component="small">
              {r.status === 'pending'
                ? `Waits for an admin. Asked ${dateOf(r.time)}.`
                : `Denied ${dateOf(r.deniedAt)}: ${r.denyReason ?? ''}`}
            </Content>
          </div>
          <Button
            variant={r.status === 'pending' ? 'secondary' : 'link'}
            onClick={() => act(r)}
            isLoading={busy === r.id}
            isDisabled={busy !== undefined}
            aria-label={`${r.status === 'pending' ? 'Cancel' : 'Remove'} the request ${r.title}`}
          >
            {r.status === 'pending' ? 'Cancel' : 'Remove'}
          </Button>
        </div>
      ))}
    </section>
  );
};

export default ProjectRequestsPanel;
