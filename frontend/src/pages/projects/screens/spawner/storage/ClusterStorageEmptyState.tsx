import React from 'react';
import { EmptyState, EmptyStateVariant, Title, EmptyStateBody } from '@patternfly/react-core';
import { PlusCircleIcon } from '@patternfly/react-icons';

export const ClusterStorageEmptyState: React.FC = () => (
  <EmptyState
    titleText={
      <Title headingLevel="h2" size="lg">
        No volumes
      </Title>
    }
    icon={PlusCircleIcon}
    variant={EmptyStateVariant.xs}
    data-testid="cluster-storage-empty-state"
  >
    <EmptyStateBody>
      To keep your project&apos;s data, attach a volume to your workbench. Without one, your data
      does not survive a stop.
    </EmptyStateBody>
  </EmptyState>
);
