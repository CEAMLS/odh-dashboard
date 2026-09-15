import {
  mockDashboardConfig,
  mockDscStatus,
  mockK8sResourceList,
  mockProjectK8sResource,
} from '#~/__mocks__';
import { projectListPage } from '#~/__tests__/cypress/cypress/pages/projects';
import { asProjectAdminUser } from '#~/__tests__/cypress/cypress/utils/mockUsers';
import { ProjectModel } from '#~/__tests__/cypress/cypress/utils/models';
import type { ProjectKind } from '#~/k8sTypes';

// CEAMLS: the dashboard lists only projects created by tenancy requests
// (namespaces labeled ceamls.morgan.edu/managed=true) and never offers to
// create one, even to users whose RBAC allows it.

const tenancyProject = mockProjectK8sResource({
  k8sName: 'tenancy-project',
  displayName: 'Tenancy Project',
});
const otherProject = mockProjectK8sResource({
  k8sName: 'other-project',
  displayName: 'Other Project',
  isTenancyProject: false,
});

const initIntercepts = (projects: ProjectKind[]) => {
  asProjectAdminUser({ isSelfProvisioner: true });
  cy.interceptOdh(
    'GET /api/dsc/status',
    mockDscStatus({
      installedComponents: {
        workbenches: true,
      },
    }),
  );
  cy.interceptOdh('GET /api/config', mockDashboardConfig({}));
  cy.interceptK8sList(ProjectModel, mockK8sResourceList(projects));
};

describe('CEAMLS tenancy projects', () => {
  it('lists only tenancy projects', () => {
    initIntercepts([tenancyProject, otherProject]);
    projectListPage.visit();

    projectListPage.shouldHaveProjects();
    projectListPage.findProjectLink('Tenancy Project').should('exist');
    projectListPage
      .findProjectsTable()
      .findByRole('link', { name: 'Other Project' })
      .should('not.exist');
  });

  it('offers a project request instead of project creation', () => {
    initIntercepts([tenancyProject]);
    projectListPage.visit();

    projectListPage.findCreateProjectButton().should('not.exist');
    cy.findByRole('button', { name: 'Need another project?' }).click();
    cy.findByTestId('projects-admin-help-content').should('exist');
  });

  it('treats a user with only non-tenancy projects as having none', () => {
    initIntercepts([otherProject]);
    projectListPage.visit();

    projectListPage.shouldBeEmpty();
    projectListPage.findCreateProjectButton().should('not.exist');
    cy.findByTestId('projects-empty-admin-help').should('exist');
  });

  it('does not open a non-tenancy project by URL', () => {
    initIntercepts([tenancyProject, otherProject]);
    cy.visitWithLogin('/projects/other-project');

    cy.contains('Problem loading project details').should('exist');
  });

  it('offers a project request on the Workbenches page when there are no projects', () => {
    initIntercepts([otherProject]);
    cy.visitWithLogin('/workbenches');

    cy.findByTestId('empty-state-title').should('exist');
    projectListPage.findCreateProjectButton().should('not.exist');
    cy.findByTestId('request-data-science-project').should('have.text', 'Need another project?');
  });
});
