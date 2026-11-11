import * as React from 'react';
import { ActionsColumn, IAction, Td, Tr } from '@patternfly/react-table';
import { Flex, FlexItem, Skeleton, Content } from '@patternfly/react-core';
import { HddIcon } from '@patternfly/react-icons';
import type { PersistentVolumeClaimKind } from '@odh-dashboard/k8s-core';
import type { ConnectedResourceLabel } from '@odh-dashboard/plugin-core/extension-points';
import {
  getDescriptionFromK8sResource,
  getDisplayNameFromK8sResource,
  getPvcAccessMode,
} from '@odh-dashboard/k8s-core';
import StorageSizeBar from '#~/pages/projects/components/StorageSizeBars';
import { TableRowTitleDescription } from '#~/components/table';
import { sharedLabel } from '#~/pages/ceamls/storage/volumeKinds';
import ConnectedResources from '#~/pages/projects/screens/detail/connections/ConnectedResources';
import useIsRootVolume from './useIsRootVolume';
import StorageWarningStatus from './StorageWarningStatus';
import { StorageTableData } from './types';
import { getPVCContextStorageType, StorageContextType } from './useStorageContextType';

type StorageTableRowProps = {
  rowIndex: number;
  obj: StorageTableData;
  storageContextTypes?: StorageContextType[];
  storageContextTypesLoaded?: boolean;
  showConnectedResources: boolean;
  additionalResourcesLoaded: boolean;
  getConnectedResourceLabels: (pvc: PersistentVolumeClaimKind) => ConnectedResourceLabel[];
  onDeletePVC: (pvc: PersistentVolumeClaimKind) => void;
  onEditPVC: (pvc: PersistentVolumeClaimKind) => void;
  onAddPVC: () => void;
};

const StorageTableRow: React.FC<StorageTableRowProps> = ({
  rowIndex,
  obj,
  storageContextTypes,
  storageContextTypesLoaded,
  showConnectedResources,
  additionalResourcesLoaded,
  getConnectedResourceLabels,
  onDeletePVC,
  onEditPVC,
  onAddPVC,
}) => {
  const isRootVolume = useIsRootVolume(obj.pvc);
  const actions: IAction[] = [
    {
      title: <span data-testid="edit-storage-action">Edit storage</span>,
      onClick: () => {
        onEditPVC(obj.pvc);
      },
    },
  ];

  if (!isRootVolume) {
    actions.push({ isSeparator: true });
    actions.push({
      title: <span data-testid="delete-storage-action">Delete storage</span>,
      onClick: () => {
        onDeletePVC(obj.pvc);
      },
    });
  }

  return (
    <Tr {...(rowIndex % 2 === 0 && { isStriped: true })}>
      <Td dataLabel="Name">
        <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }}>
          <FlexItem>
            <TableRowTitleDescription
              title={getDisplayNameFromK8sResource(obj.pvc)}
              resource={obj.pvc}
            />
          </FlexItem>
          <FlexItem>
            <StorageWarningStatus obj={obj.pvc} onEditPVC={onEditPVC} onAddPVC={onAddPVC} />
          </FlexItem>
        </Flex>
        <Content component="p">{getDescriptionFromK8sResource(obj.pvc)}</Content>
      </Td>

      <Td dataLabel="Shared">
        <Content component="p">{sharedLabel(getPvcAccessMode(obj.pvc))}</Content>
      </Td>
      <Td dataLabel="Storage context">
        {storageContextTypesLoaded ? (
          <Content component="p">
            <Flex>
              <FlexItem spacer={{ default: 'spacerSm' }}>
                <HddIcon />
              </FlexItem>
              <FlexItem>{` ${
                getPVCContextStorageType(obj.pvc, storageContextTypes).title
              }`}</FlexItem>
            </Flex>
          </Content>
        ) : (
          <Skeleton />
        )}
      </Td>
      <Td dataLabel="Storage size">
        <StorageSizeBar pvc={obj.pvc} />
      </Td>
      {showConnectedResources && (
        <Td dataLabel="Connected resources">
          <ConnectedResources
            pvc={obj.pvc}
            additionalResources={getConnectedResourceLabels(obj.pvc)}
            additionalResourcesLoaded={additionalResourcesLoaded}
          />
        </Td>
      )}
      <Td isActionCell>
        <ActionsColumn items={actions} />
      </Td>
    </Tr>
  );
};

export default StorageTableRow;
