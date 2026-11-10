import * as React from 'react';
import { EmptyState, EmptyStateBody, EmptyStateFooter } from '@patternfly/react-core';
import projectsEmptyStateImg from '#~/images/empty-state-projects-color.svg';
import ProjectRequestsPanel from '#~/pages/ceamls/requests/ProjectRequestsPanel';
import RequestProjectButton from '#~/pages/ceamls/requests/RequestProjectButton';

// CEAMLS: a person with no project asks for one here. The requests the
// person made show under the empty state until an admin answers them.
const EmptyProjects: React.FC = () => (
  <>
    <EmptyState
      data-testid="no-project"
      headingLevel="h2"
      icon={() => <img style={{ height: 320 }} src={projectsEmptyStateImg} alt="no projects" />}
      titleText="Start by requesting a project"
      variant="lg"
    >
      <EmptyStateBody data-testid="projects-empty-body-text">
        A project is your workspace on the cluster: its own limits, its own storage, and the people
        who share it. Ask for one, and an admin creates it. A PI can also add you to a project that
        exists.
      </EmptyStateBody>
      <EmptyStateFooter>
        <RequestProjectButton />
      </EmptyStateFooter>
    </EmptyState>
    <ProjectRequestsPanel />
  </>
);

export default EmptyProjects;
