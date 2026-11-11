import * as React from 'react';
import { Checkbox, FormGroup } from '@patternfly/react-core';

type SharedVolumeFieldProps = {
  isShared: boolean;
  /** No handler: the volume exists, and its kind cannot change. */
  onChange?: (shared: boolean) => void;
};

/** CEAMLS: the one choice in place of the storage class and the access mode. */
const SharedVolumeField: React.FC<SharedVolumeFieldProps> = ({ isShared, onChange }) => (
  <FormGroup fieldId="create-new-storage-shared" role="group">
    <Checkbox
      id="create-new-storage-shared"
      data-testid="create-new-storage-shared"
      label="Shared volume"
      description={
        onChange
          ? 'Many workbenches can use a shared volume at the same time. Without this, one workbench at a time uses the volume. You cannot change this later.'
          : 'You cannot change this after the volume is made.'
      }
      isChecked={isShared}
      isDisabled={!onChange}
      onChange={(_e, checked) => onChange?.(checked)}
    />
  </FormGroup>
);

export default SharedVolumeField;
