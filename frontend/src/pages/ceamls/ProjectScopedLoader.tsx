import * as React from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { EmptyState, EmptyStateBody, EmptyStateFooter } from '@patternfly/react-core';
import { WrenchIcon } from '@patternfly/react-icons/dist/esm/icons/wrench-icon';
import ApplicationsPage from '#~/pages/ApplicationsPage';
import { byName, ProjectsContext } from '#~/concepts/projects/ProjectsContext';
import InvalidProject from '#~/concepts/projects/InvalidProject';
import ProjectSelectorNavigator from '#~/concepts/projects/ProjectSelectorNavigator';
import NewProjectButton from '#~/pages/projects/screens/projects/NewProjectButton';
import ProjectDetailsContextProvider from '#~/pages/projects/ProjectDetailsContext';

type ProjectScopedLoaderProps = {
  title: string;
  description: React.ReactNode;
  /** Shown when the user has no projects yet. */
  noProjectsBody: string;
  getRedirectPath: (namespace: string) => string;
};

/**
 * Resolves `:namespace` for a top-level page that shows one project at a time
 * (Workbenches, Storage). Mirrors GlobalPipelineCoreLoader: no namespace
 * redirects to the preferred project, an unknown one offers the selector, and
 * a valid one mounts the project details context so the existing project
 * section components render unchanged.
 */
const ProjectScopedLoader: React.FC<ProjectScopedLoaderProps> = ({
  title,
  description,
  noProjectsBody,
  getRedirectPath,
}) => {
  const navigate = useNavigate();
  const { namespace } = useParams<{ namespace: string }>();
  const { projects, preferredProject } = React.useContext(ProjectsContext);

  if (projects.length > 0 && !namespace) {
    const redirectProject = preferredProject ?? projects[0];
    return <Navigate to={getRedirectPath(redirectProject.metadata.name)} replace />;
  }

  if (namespace && projects.find(byName(namespace))) {
    return <ProjectDetailsContextProvider />;
  }

  return (
    <ApplicationsPage
      title={title}
      description={description}
      loaded
      empty
      emptyStatePage={
        projects.length === 0 ? (
          <EmptyState
            headingLevel="h4"
            icon={WrenchIcon}
            titleText="No projects"
            data-testid="empty-state-title"
          >
            <EmptyStateBody>{noProjectsBody}</EmptyStateBody>
            <EmptyStateFooter>
              <NewProjectButton
                closeOnCreate
                onProjectCreated={(projectName) => navigate(getRedirectPath(projectName))}
              />
            </EmptyStateFooter>
          </EmptyState>
        ) : (
          <InvalidProject namespace={namespace} getRedirectPath={getRedirectPath} />
        )
      }
      headerContent={
        projects.length > 0 && (
          <ProjectSelectorNavigator getRedirectPath={getRedirectPath} showTitle />
        )
      }
      provideChildrenPadding
    />
  );
};

export default ProjectScopedLoader;
