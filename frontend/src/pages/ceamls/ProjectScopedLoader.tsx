import * as React from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { EmptyState, EmptyStateBody, EmptyStateFooter } from '@patternfly/react-core';
import { WrenchIcon } from '@patternfly/react-icons/dist/esm/icons/wrench-icon';
import { ApplicationsPage } from '@odh-dashboard/ui-core';
import InvalidProject from '@odh-dashboard/ui-core/components/InvalidProject';
import { getStoredPreferredProject } from '@odh-dashboard/ui-core/context/getStoredPreferredProject';
import type { AccessReviewResourceAttributes } from '@odh-dashboard/k8s-core';
import { useAccessReview } from '@odh-dashboard/plugin-core/host-api';
import { byName, ProjectsContext } from '#~/concepts/projects/ProjectsContext';
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

const accessReviewResource: AccessReviewResourceAttributes = {
  group: 'project.openshift.io',
  resource: 'projectrequests',
  verb: 'create',
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
  // Same rule as the Projects page: the create button only for users who may
  // create a project. CEAMLS researchers get their projects from tenancy.
  const [allowCreate] = useAccessReview(accessReviewResource);

  if (projects.length > 0 && !namespace) {
    const redirectProject = getStoredPreferredProject(projects) ?? preferredProject ?? projects[0];
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
            {allowCreate && (
              <EmptyStateFooter>
                <NewProjectButton
                  closeOnCreate
                  onProjectCreated={(projectName) => navigate(getRedirectPath(projectName))}
                />
              </EmptyStateFooter>
            )}
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
