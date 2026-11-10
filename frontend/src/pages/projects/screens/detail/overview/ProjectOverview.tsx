import * as React from 'react';
import { PageSection } from '@patternfly/react-core';
import { ProjectSectionID } from '#~/pages/projects/screens/detail/types';
import { ProjectDetailsContext } from '#~/pages/projects/ProjectDetailsContext';
import CeamlsProjectOverview from '#~/pages/ceamls/overview/CeamlsProjectOverview';

// CEAMLS: the stock tab (the workbench, pipeline, model and configuration
// cards) repeats the tabs next to it. The tab now shows the project facts,
// the quota, what runs, the use over time and the people.
const ProjectOverview: React.FC = () => {
  const { currentProject } = React.useContext(ProjectDetailsContext);

  return (
    <PageSection
      hasBodyWrapper={false}
      isFilled
      aria-label="project-details-page-section"
      id={ProjectSectionID.OVERVIEW}
    >
      <div data-testid={`section-${ProjectSectionID.OVERVIEW}`}>
        <CeamlsProjectOverview ns={currentProject.metadata.name} />
      </div>
    </PageSection>
  );
};

export default ProjectOverview;
