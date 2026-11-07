// CEAMLS: the KubeVirt and CDI models the Virtual machines pages read and
// write through the hub's cluster API proxy.
import type { K8sModelCommon } from '@openshift/dynamic-plugin-sdk-utils';

export const VirtualMachineModel: K8sModelCommon = {
  apiVersion: 'v1',
  apiGroup: 'kubevirt.io',
  kind: 'VirtualMachine',
  plural: 'virtualmachines',
};

export const VirtualMachineInstanceModel: K8sModelCommon = {
  apiVersion: 'v1',
  apiGroup: 'kubevirt.io',
  kind: 'VirtualMachineInstance',
  plural: 'virtualmachineinstances',
};

export const ClusterInstancetypeModel: K8sModelCommon = {
  apiVersion: 'v1beta1',
  apiGroup: 'instancetype.kubevirt.io',
  kind: 'VirtualMachineClusterInstancetype',
  plural: 'virtualmachineclusterinstancetypes',
};

export const InstancetypeModel: K8sModelCommon = {
  apiVersion: 'v1beta1',
  apiGroup: 'instancetype.kubevirt.io',
  kind: 'VirtualMachineInstancetype',
  plural: 'virtualmachineinstancetypes',
};

export const DataSourceModel: K8sModelCommon = {
  apiVersion: 'v1beta1',
  apiGroup: 'cdi.kubevirt.io',
  kind: 'DataSource',
  plural: 'datasources',
};
