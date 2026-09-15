import * as React from 'react';
import { Button, Popover, Tooltip } from '@patternfly/react-core';
import { useNavigate } from 'react-router-dom';
import { OutlinedQuestionCircleIcon } from '@patternfly/react-icons';
import { ProjectSectionID } from '#~/pages/projects/screens/detail/types';
import { ProjectSectionTitles } from '#~/pages/projects/screens/detail/const';
import { ProjectDetailsContext } from '#~/pages/projects/ProjectDetailsContext';
import { FAST_POLL_INTERVAL, POLL_INTERVAL } from '#~/utilities/const';
import DetailsSection from '#~/pages/projects/screens/detail/DetailsSection';
import EmptyDetailsView from '#~/components/EmptyDetailsView';
import DashboardPopupIconButton from '#~/concepts/dashboard/DashboardPopupIconButton';
import { ProjectObjectType, typedEmptyImage } from '#~/concepts/design/utils';
import useRefreshInterval from '#~/utilities/useRefreshInterval';
import { useKueueConfiguration } from '#~/concepts/hardwareProfiles/kueueUtils';
import { KUEUE_WORKBENCH_CREATION_DISABLED_MESSAGE } from '#~/concepts/hardwareProfiles/kueueConstants';
import { WorkbenchPathsContext } from '#~/pages/ceamls/WorkbenchPathsContext';
import NotebookTable from './NotebookTable';

type NotebookListProps = {
  /** CEAMLS: false on the top-level Workbenches page, which already titles itself. */
  showTitle?: boolean;
};

const NotebookList: React.FC<NotebookListProps> = ({ showTitle = true }) => {
  const {
    currentProject,
    notebooks: {
      data: notebooks,
      loaded: notebooksLoaded,
      error: notebooksError,
      refresh: refreshNotebooks,
    },
  } = React.useContext(ProjectDetailsContext);
  const workbenchPaths = React.useContext(WorkbenchPathsContext);
  const navigate = useNavigate();
  const projectName = currentProject.metadata.name;
  const isNotebooksEmpty = notebooks.length === 0;

  useRefreshInterval(FAST_POLL_INTERVAL, () =>
    notebooks
      .filter((notebookState) => notebookState.isStarting || notebookState.isStopping)
      .forEach((notebookState) => notebookState.refresh()),
  );

  useRefreshInterval(POLL_INTERVAL, () =>
    notebooks
      .filter((notebookState) => !notebookState.isStarting && !notebookState.isStopping)
      .forEach((notebookState) => notebookState.refresh()),
  );

  const { isKueueDisabled } = useKueueConfiguration(currentProject);

  const getCreateButton = () => {
    if (isKueueDisabled) {
      return (
        <Tooltip content={KUEUE_WORKBENCH_CREATION_DISABLED_MESSAGE}>
          <Button
            key={`action-${ProjectSectionID.WORKBENCHES}`}
            onClick={() => navigate(workbenchPaths.create(projectName))}
            data-testid="create-workbench-button"
            variant="primary"
            isAriaDisabled
          >
            Create workbench
          </Button>
        </Tooltip>
      );
    }
    return (
      <Button
        key={`action-${ProjectSectionID.WORKBENCHES}`}
        onClick={() => navigate(workbenchPaths.create(projectName))}
        data-testid="create-workbench-button"
        variant="primary"
      >
        Create workbench
      </Button>
    );
  };

  return (
    <DetailsSection
      objectType={showTitle ? ProjectObjectType.notebook : undefined}
      id={ProjectSectionID.WORKBENCHES}
      title={
        (showTitle && !isNotebooksEmpty && ProjectSectionTitles[ProjectSectionID.WORKBENCHES]) || ''
      }
      popover={
        showTitle &&
        !isNotebooksEmpty && (
          <Popover
            headerContent="About workbenches"
            bodyContent="A workbench is an isolated area where you can work with models in your preferred IDE, such as a Jupyter notebook. You can add accelerators and connections, create pipelines, and add cluster storage in your workbench."
          >
            <DashboardPopupIconButton
              icon={<OutlinedQuestionCircleIcon />}
              aria-label="More info"
            />
          </Popover>
        )
      }
      actions={[getCreateButton()]}
      isLoading={!notebooksLoaded}
      loadError={notebooksError}
      isEmpty={isNotebooksEmpty}
      emptyState={
        <EmptyDetailsView
          title="Start by creating a workbench"
          description="A workbench is an isolated area where you can work with models in your preferred IDE, such as a Jupyter notebook. You can add accelerators and connections, create pipelines, and add cluster storage in your workbench."
          iconImage={typedEmptyImage(ProjectObjectType.notebook)}
          imageAlt="create a workbench"
          createButton={getCreateButton()}
        />
      }
    >
      {!isNotebooksEmpty ? (
        <NotebookTable notebookStates={notebooks} refresh={refreshNotebooks} />
      ) : null}
    </DetailsSection>
  );
};

export default NotebookList;
