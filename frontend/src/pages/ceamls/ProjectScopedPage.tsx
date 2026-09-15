import * as React from 'react';
import ApplicationsPage from '#~/pages/ApplicationsPage';
import ProjectSelectorNavigator from '#~/concepts/projects/ProjectSelectorNavigator';

type ProjectScopedPageProps = {
  title: string;
  description: React.ReactNode;
  getRedirectPath: (namespace: string) => string;
  children: React.ReactNode;
};

/**
 * Page shell for a top-level page that shows one project at a time: the page
 * title, the project selector, then a project section component. The section
 * (a DetailsSection) brings its own PageSection padding.
 */
const ProjectScopedPage: React.FC<ProjectScopedPageProps> = ({
  title,
  description,
  getRedirectPath,
  children,
}) => (
  <ApplicationsPage
    title={title}
    description={description}
    loaded
    empty={false}
    headerContent={<ProjectSelectorNavigator getRedirectPath={getRedirectPath} showTitle />}
  >
    {children}
  </ApplicationsPage>
);

export default ProjectScopedPage;
