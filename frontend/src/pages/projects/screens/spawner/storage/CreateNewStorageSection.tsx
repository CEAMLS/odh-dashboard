import * as React from 'react';
import { FormSection, HelperTextItem } from '@patternfly/react-core';
import { ExclamationCircleIcon } from '@patternfly/react-icons';
import type { PersistentVolumeClaimKind } from '@odh-dashboard/k8s-core';
import { SupportedArea, useIsAreaAvailable } from '@odh-dashboard/plugin-core/areas';
import { isK8sNameDescriptionDataValid, LimitNameResourceType } from '@odh-dashboard/k8s-core';
import K8sNameDescriptionField, {
  useK8sNameDescriptionFieldData,
} from '@odh-dashboard/ui-core/components/K8sNameDescriptionField';
import type { UpdateObjectAtPropAndValue } from '@odh-dashboard/ui-core';
import { StorageData } from '#~/pages/projects/types';
import PVSizeField from '#~/pages/projects/components/PVSizeField';
import { StorageContextType } from '#~/pages/projects/screens/detail/storage/useStorageContextType';
import { AccessMode } from '#~/pages/storageClasses/storageEnums';
import SharedVolumeField from '#~/pages/ceamls/storage/SharedVolumeField';
import { isSharedAccessMode, sharedClassName } from '#~/pages/ceamls/storage/volumeKinds';
import { useDefaultStorageClass } from './useDefaultStorageClass';
import { useGetStorageClassConfig } from './useGetStorageClassConfig';
import PVCContextField, { PVCContextFieldSkeleton } from './PVCContextField';

type CreateNewStorageSectionProps<D extends StorageData> = {
  data: D;
  setData: UpdateObjectAtPropAndValue<D>;
  currentStatus?: PersistentVolumeClaimKind['status'];
  autoFocusName?: boolean;
  disableStorageClassSelect?: boolean;
  onNameChange?: (value: string) => void;
  setValid?: (isValid: boolean) => void;
  hasDuplicateName?: boolean;
  editableK8sName?: boolean;
  storageContextTypes?: StorageContextType[];
  storageContextTypesLoaded?: boolean;
};

const CreateNewStorageSection = <D extends StorageData>({
  data,
  setData,
  currentStatus,
  autoFocusName,
  disableStorageClassSelect,
  onNameChange,
  setValid,
  hasDuplicateName,
  editableK8sName,
  storageContextTypes,
  storageContextTypesLoaded,
}: CreateNewStorageSectionProps<D>): React.ReactNode => {
  const isStorageClassesAvailable = useIsAreaAvailable(SupportedArea.STORAGE_CLASSES).status;
  const { data: clusterStorageNameDesc, onDataChange: setClusterNameDesc } =
    useK8sNameDescriptionFieldData({
      initialData: {
        name: data.name,
        k8sName: data.k8sName,
        description: data.description,
      },
      limitNameResourceType: LimitNameResourceType.PVC,
      editableK8sName,
    });

  const { storageClasses } = useGetStorageClassConfig(data.storageClassName);
  const [defaultStorageClass] = useDefaultStorageClass();
  const sharedClass = sharedClassName(storageClasses);

  const [isValidModelPath, setIsValidModelPath] = React.useState(true);
  const removeModelAnnotations = () => {
    setData('modelName', '');
    setData('modelPath', '');
  };

  React.useEffect(() => {
    setData('name', clusterStorageNameDesc.name);
    setData('k8sName', clusterStorageNameDesc.k8sName.value);
    setData('description', clusterStorageNameDesc.description);
    onNameChange?.(clusterStorageNameDesc.name);
    setValid?.(isK8sNameDescriptionDataValid(clusterStorageNameDesc) && isValidModelPath);
    // only update if the name description changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusterStorageNameDesc, isValidModelPath]);

  // Not all consumers of this modal load extensions for dynamic context types (workbenches)
  const isContextTypeLoaded =
    storageContextTypes === undefined || storageContextTypesLoaded === true;

  return (
    <FormSection>
      <K8sNameDescriptionField
        data={clusterStorageNameDesc}
        onDataChange={setClusterNameDesc}
        dataTestId="create-new-storage"
        autoFocusName={autoFocusName}
        maxLength={250}
        maxLengthDesc={5500}
        nameHelperText={
          hasDuplicateName ? (
            <HelperTextItem icon={<ExclamationCircleIcon />} variant="error">
              <b>{data.name}</b> already exists. Try a different name.
            </HelperTextItem>
          ) : undefined
        }
      />
      {isStorageClassesAvailable && (
        <>
          {/* CEAMLS: no storage class and no access mode. One choice: shared or not. */}
          {(sharedClass || isSharedAccessMode(data.accessMode)) && (
            <SharedVolumeField
              isShared={isSharedAccessMode(data.accessMode)}
              onChange={
                disableStorageClassSelect || !sharedClass
                  ? undefined
                  : (shared) => {
                      setData(
                        'storageClassName',
                        shared ? sharedClass : defaultStorageClass?.metadata.name,
                      );
                      setData('accessMode', shared ? AccessMode.RWX : AccessMode.RWO);
                    }
              }
            />
          )}
        </>
      )}
      {isContextTypeLoaded ? (
        <PVCContextField
          modelName={data.modelName || ''}
          modelPath={data.modelPath || ''}
          setModelName={(name) => setData('modelName', name)}
          setModelPath={(path) => setData('modelPath', path)}
          setValid={setIsValidModelPath}
          removeModelAnnotations={removeModelAnnotations}
          existingPvc={data.existingPvc}
          storageContextTypes={storageContextTypes}
          setContextTypeAnnotations={(annotations) =>
            setData('contextTypeAnnotations', annotations)
          }
        />
      ) : (
        <PVCContextFieldSkeleton />
      )}

      <PVSizeField
        fieldID="create-new-storage-size"
        currentStatus={currentStatus}
        size={String(data.size)}
        setSize={(size) => setData('size', size)}
        existingPvcName={data.existingPvc?.metadata.name}
      />
    </FormSection>
  );
};

export default CreateNewStorageSection;
