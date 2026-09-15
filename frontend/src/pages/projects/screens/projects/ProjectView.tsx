import * as React from 'react';
import ApplicationsPage from '#~/pages/ApplicationsPage';
import { ProjectsContext } from '#~/concepts/projects/ProjectsContext';
import { ProjectObjectType } from '#~/concepts/design/utils';
import TitleWithIcon from '#~/concepts/design/TitleWithIcon';
import LaunchJupyterButton from '#~/pages/projects/screens/projects/LaunchJupyterButton';
import { useAppContext } from '#~/app/AppContext';
import EmptyProjects from './EmptyProjects';
import ProjectListView from './ProjectListView';

const ProjectView: React.FC = () => {
  const { dashboardConfig } = useAppContext();
  const { projects } = React.useContext(ProjectsContext);

  // CEAMLS: projects come only from tenancy requests, so nobody gets the create
  // flow, whatever their RBAC (see NewProjectButton).
  return (
    <ApplicationsPage
      title={<TitleWithIcon title="Data science projects" objectType={ProjectObjectType.project} />}
      headerAction={
        dashboardConfig.spec.notebookController?.enabled ? <LaunchJupyterButton /> : undefined
      }
      description="View your existing projects."
      loaded
      empty={projects.length === 0}
      emptyStatePage={<EmptyProjects allowCreate={false} />}
      provideChildrenPadding
    >
      <ProjectListView allowCreate={false} />
    </ApplicationsPage>
  );
};

export default ProjectView;
