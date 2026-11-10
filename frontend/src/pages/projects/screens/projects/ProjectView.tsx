import * as React from 'react';
import TitleWithIcon from '@odh-dashboard/ui-core/design/TitleWithIcon';
import { ApplicationsPage } from '@odh-dashboard/ui-core';
import { ProjectsContext } from '#~/concepts/projects/ProjectsContext';
import { ProjectObjectType } from '#~/concepts/design/utils';
import LaunchJupyterButton from '#~/pages/projects/screens/projects/LaunchJupyterButton';
import { useAppContext } from '#~/app/AppContext';
import { ProjectRequestsProvider } from '#~/pages/ceamls/requests/ProjectRequestsContext';
import EmptyProjects from './EmptyProjects';
import ProjectListView from './ProjectListView';

// CEAMLS (2026-11-10): nobody creates a project here, not even an admin.
// Every signed-in person asks for one with Request a project; an admin
// creates it in CEAMLS Cluster Admin from the request, with its quota and
// its people. So there is no access review for projectrequests.
const ProjectView: React.FC = () => {
  const { dashboardConfig } = useAppContext();
  const { projects } = React.useContext(ProjectsContext);

  return (
    <ProjectRequestsProvider>
      <ApplicationsPage
        title={<TitleWithIcon title="Projects" objectType={ProjectObjectType.project} />}
        headerAction={
          dashboardConfig.spec.notebookController?.enabled ? <LaunchJupyterButton /> : undefined
        }
        description="View your projects, or request a new one."
        loaded
        empty={projects.length === 0}
        emptyStatePage={<EmptyProjects />}
        provideChildrenPadding
      >
        <ProjectListView />
      </ApplicationsPage>
    </ProjectRequestsProvider>
  );
};

export default ProjectView;
