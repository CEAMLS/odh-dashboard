import * as React from 'react';
import WhosMyAdministrator from '#~/components/WhosMyAdministrator';

type NewProjectButtonProps = {
  closeOnCreate?: boolean;
  onProjectCreated?: (projectName: string) => void;
};

/**
 * CEAMLS: projects come only from tenancy requests, and the dashboard lists only
 * those (pages/ceamls/tenancyProjects). A project created here would never show
 * up, so every "Create project" entry point offers a project request instead.
 * The props stay so upstream callers compile unchanged.
 */
const NewProjectButton: React.FC<NewProjectButtonProps> = () => (
  <WhosMyAdministrator
    buttonLabel="Need another project?"
    headerContent="Need another project?"
    leadText="To request a new project, contact your administrator."
    linkTestId="request-data-science-project"
  />
);

export default NewProjectButton;
