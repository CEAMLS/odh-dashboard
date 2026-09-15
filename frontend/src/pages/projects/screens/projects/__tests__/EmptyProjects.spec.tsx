import React from 'react';
import { act, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import EmptyProjects from '#~/pages/projects/screens/projects/EmptyProjects';
import { useUser } from '#~/redux/selectors';

jest.mock('#~/app/AppContext', () => ({
  __esModule: true,
  useAppContext: jest.fn(),
}));

jest.mock('#~/redux/selectors', () => ({
  ...jest.requireActual('#~/redux/selectors'),
  useUser: jest.fn(),
  useClusterInfo: jest.fn(),
}));
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: jest.fn(),
}));

const useUserMock = jest.mocked(useUser);
useUserMock.mockReturnValue({
  username: 'test-user',
  userID: '1234',
  isAdmin: false,
  isAllowed: true,
  userLoading: false,
  userError: null,
});

describe('EmptyProjects', () => {
  // CEAMLS: projects come only from tenancy requests, so even users allowed to
  // create projects get a project request instead (see NewProjectButton).
  it('should offer a project request when allowed to create projects', async () => {
    render(<EmptyProjects allowCreate />);
    expect(screen.queryByTestId('create-data-science-project')).not.toBeInTheDocument();
    const requestProject = await screen.findByTestId('request-data-science-project');
    expect(requestProject).toHaveTextContent('Need another project?');
    const bodyText = await screen.findByTestId('projects-empty-body-text');
    expect(bodyText).toHaveTextContent(
      'Projects allow you and your team to organize and collaborate on resources within separate namespaces.',
    );
    expect(bodyText).not.toHaveTextContent('To request a project, contact your administrator.');
  });
  it('should show the who is my admin help when not allowed to create projects', async () => {
    render(<EmptyProjects allowCreate={false} />);
    const bodyText = await screen.findByTestId('projects-empty-body-text');
    expect(bodyText).toHaveTextContent(
      'Projects allow you and your team to organize and collaborate on resources within separate namespaces. To request a project, contact your administrator.',
    );
    const adminHelpButton = await screen.findByTestId('projects-empty-admin-help');
    act(() => adminHelpButton.click());
    const helpContent = await screen.findByTestId('projects-empty-admin-help-content');
    expect(helpContent).toBeVisible();
  });
});
