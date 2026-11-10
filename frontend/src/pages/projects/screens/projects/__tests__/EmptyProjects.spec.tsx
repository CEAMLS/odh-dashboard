import React from 'react';
import { act, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import EmptyProjects from '#~/pages/projects/screens/projects/EmptyProjects';
import { ProjectRequestsProvider } from '#~/pages/ceamls/requests/ProjectRequestsContext';
import { getMyRequests } from '#~/pages/ceamls/requests/api';
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
jest.mock('#~/pages/ceamls/requests/api', () => ({
  ...jest.requireActual('#~/pages/ceamls/requests/api'),
  getMyRequests: jest.fn(),
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

const me = {
  you: 'me@morgan.edu',
  name: 'Me',
  standing: 'ceamls-researchers',
  defaults: { gpu: 0, cpu: 16, memory: 64, storage: 500, objectStorage: 0 },
};

describe('EmptyProjects', () => {
  // CEAMLS: every person asks for a project here; nobody creates one.
  it('shows Request a project for everyone, and the dialog on click', async () => {
    jest.mocked(getMyRequests).mockResolvedValue({ ...me, requests: [] });
    render(
      <ProjectRequestsProvider>
        <EmptyProjects />
      </ProjectRequestsProvider>,
    );
    const button = await screen.findByTestId('ceamls-request-project');
    expect(button).toBeEnabled();
    expect(screen.queryByTestId('create-project')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ceamls-request')).not.toBeInTheDocument();
    act(() => button.click());
    expect(await screen.findByRole('dialog')).toHaveTextContent('Request a project');
    expect(screen.getByTestId('ceamls-request-send')).toBeDisabled();
  });

  it('lists the requests the person made, with the answer', async () => {
    jest.mocked(getMyRequests).mockResolvedValue({
      ...me,
      requests: [
        {
          id: 'vision.0a1b2c3d',
          name: 'vision',
          title: 'Vision lab',
          description: 'Images.',
          pi: 'me@morgan.edu',
          endDate: null,
          quota: {},
          time: '2026-11-10T10:00:00Z',
          status: 'pending',
        },
        {
          id: 'maps.0a1b2c3e',
          name: 'maps',
          title: 'Maps',
          description: 'Maps.',
          pi: 'me@morgan.edu',
          endDate: null,
          quota: {},
          time: '2026-11-09T10:00:00Z',
          status: 'denied',
          denyReason: 'No GPU this term.',
          deniedAt: '2026-11-10T09:00:00Z',
        },
      ],
    });
    render(
      <ProjectRequestsProvider>
        <EmptyProjects />
      </ProjectRequestsProvider>,
    );
    const rows = await screen.findAllByTestId('ceamls-request');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Waits for an admin. Asked 2026-11-10.');
    expect(rows[1]).toHaveTextContent('Denied 2026-11-10: No GPU this term.');
    expect(screen.getByRole('button', { name: 'Cancel the request Vision lab' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Remove the request Maps' })).toBeEnabled();
  });
});
