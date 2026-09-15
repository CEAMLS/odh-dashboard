import { ProjectKind } from '#~/k8sTypes';

/**
 * CEAMLS: projects are created only through tenancy requests (ceamls_ai_cluster
 * `tenancy/requests` rendered into GitOps), which label the namespace with this.
 * The dashboard lists only those projects, so system and platform namespaces a
 * user can see (e.g. kubevirt-os-images) stay out of every project list.
 */
export const CEAMLS_TENANCY_LABEL = 'ceamls.morgan.edu/managed';

export const isTenancyProject = (project: ProjectKind): boolean =>
  project.metadata.labels?.[CEAMLS_TENANCY_LABEL] === 'true';
