import * as React from 'react';
import { ActionsColumn } from '@patternfly/react-table';
import { useNavigate } from 'react-router-dom';
import type { ProjectKind } from '@odh-dashboard/k8s-core';
import { NotebookKind } from '#~/k8sTypes';
import { NotebookState } from '#~/pages/projects/notebook/types';
import { WorkbenchPathsContext } from '#~/pages/ceamls/WorkbenchPathsContext';

type Props = {
  project: ProjectKind;
  notebookState: NotebookState;
  onNotebookDelete: (notebook: NotebookKind) => void;
};

export const NotebookActionsColumn: React.FC<Props> = ({
  project,
  notebookState,
  onNotebookDelete,
}) => {
  const navigate = useNavigate();
  const workbenchPaths = React.useContext(WorkbenchPathsContext);

  return (
    <ActionsColumn
      id="notebook-actions"
      items={[
        {
          title: <span data-testid="edit-workbench-action">Edit workbench</span>,
          onClick: () => {
            navigate(
              workbenchPaths.edit(project.metadata.name, notebookState.notebook.metadata.name),
            );
          },
        },
        { isSeparator: true },
        {
          title: <span data-testid="delete-workbench-action">Delete workbench</span>,
          onClick: () => {
            onNotebookDelete(notebookState.notebook);
          },
        },
      ]}
    />
  );
};
