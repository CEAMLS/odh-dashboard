import { mockProjectK8sResource } from '#~/__mocks__/mockProjectK8sResource';
import { CEAMLS_TENANCY_LABEL, isTenancyProject } from '#~/pages/ceamls/tenancyProjects';

describe('isTenancyProject', () => {
  it('should accept a project labeled by tenancy', () => {
    expect(isTenancyProject(mockProjectK8sResource({}))).toBe(true);
  });

  it('should reject a project without the tenancy label', () => {
    expect(isTenancyProject(mockProjectK8sResource({ isTenancyProject: false }))).toBe(false);
  });

  it('should reject a tenancy label that is not "true"', () => {
    const project = mockProjectK8sResource({ isTenancyProject: false });
    project.metadata.labels = { ...project.metadata.labels, [CEAMLS_TENANCY_LABEL]: 'false' };
    expect(isTenancyProject(project)).toBe(false);
  });
});
