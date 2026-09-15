import * as React from 'react';
import { ActionsColumn } from '@patternfly/react-table';
import { useNavigate } from 'react-router-dom';
import { NotebookKind, ProjectKind } from '#~/k8sTypes';
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
          title: 'Edit workbench',
          onClick: () => {
            navigate(
              workbenchPaths.edit(project.metadata.name, notebookState.notebook.metadata.name),
            );
          },
        },
        { isSeparator: true },
        {
          title: 'Delete workbench',
          onClick: () => {
            onNotebookDelete(notebookState.notebook);
          },
        },
      ]}
    />
  );
};
