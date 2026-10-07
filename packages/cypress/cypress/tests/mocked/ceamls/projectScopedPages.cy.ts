import { mockDashboardConfig } from '@odh-dashboard/k8s-core/__mocks__/mockDashboardConfig';
import { mockK8sResourceList } from '@odh-dashboard/k8s-core/__mocks__/mockK8sResourceList';
import { mockProjectK8sResource } from '@odh-dashboard/k8s-core/__mocks__/mockProjectK8sResource';
import { mockPodK8sResource } from '@odh-dashboard/k8s-core/__mocks__/mockPodK8sResource';
import { mockPVCK8sResource } from '@odh-dashboard/k8s-core/__mocks__/mockPVCK8sResource';
import { mockDscStatus } from '@odh-dashboard/plugin-core/__mocks__/mockDscStatus';
import { mockNotebookK8sResource, mockStorageClassList } from '@odh-dashboard/internal/__mocks__';
import { mockClusterSettings } from '@odh-dashboard/internal/__mocks__/mockClusterSettings';
import { mockImageStreamK8sResource } from '@odh-dashboard/internal/__mocks__/mockImageStreamK8sResource';
import { mockPrometheusQueryVectorResponse } from '@odh-dashboard/internal/__mocks__/mockPrometheusQueryVectorResponse';
import type { ProjectKind } from '@odh-dashboard/k8s-core';
import { appChrome } from '../../../pages/appChrome';
import { clusterStorage } from '../../../pages/clusterStorage';
import { createSpawnerPage, workbenchPage } from '../../../pages/workbench';
import { verifyRelativeURL } from '../../../utils/url';
import {
  ImageStreamModel,
  NotebookModel,
  PVCModel,
  PodModel,
  ProjectModel,
  StorageClassModel,
} from '../../../utils/models';

// CEAMLS: the top-level Workbenches and Storage pages, which show one project
// at a time behind a project selector (pages/ceamls).

const initIntercepts = ({
  projects = [mockProjectK8sResource({})],
}: {
  projects?: ProjectKind[];
}) => {
  cy.interceptOdh('GET /api/dsc/status', mockDscStatus({}));
  cy.interceptOdh('GET /api/config', mockDashboardConfig({}));
  cy.interceptOdh('GET /api/cluster-settings', mockClusterSettings({}));
  cy.interceptOdh('POST /api/prometheus/pvc', {
    code: 200,
    response: mockPrometheusQueryVectorResponse<{ metric: { __name__: string } }>({
      result: [
        {
          metric: { __name__: 'kubelet_volume_stats_used_bytes' },
          value: [1704910625, '1073741824'],
        },
        {
          metric: { __name__: 'kubelet_volume_stats_capacity_bytes' },
          value: [1704910625, '5368709120'],
        },
      ],
    }),
  });
  cy.interceptK8sList(ProjectModel, mockK8sResourceList(projects));
  cy.interceptK8s(ProjectModel, mockProjectK8sResource({}));
  cy.interceptK8sList(PodModel, mockK8sResourceList([mockPodK8sResource({})]));
  cy.interceptK8sList(StorageClassModel, mockStorageClassList());
  cy.interceptK8sList(
    ImageStreamModel,
    mockK8sResourceList([mockImageStreamK8sResource({ namespace: 'opendatahub' })]),
  );
  cy.interceptK8sList(
    { model: NotebookModel, ns: 'test-project' },
    mockK8sResourceList([
      mockNotebookK8sResource({ name: 'ceamls-notebook', displayName: 'CEAMLS Notebook' }),
    ]),
  );
  cy.interceptK8sList(
    { model: PVCModel, ns: 'test-project' },
    mockK8sResourceList([mockPVCK8sResource({ displayName: 'CEAMLS Storage' })]),
  );
};

const visitPage = (path: string) => {
  cy.visitWithLogin(path);
  cy.findByTestId('app-page-title');
  cy.testA11y();
};

const findBreadcrumb = () => cy.findByRole('navigation', { name: 'Breadcrumb' });

describe('CEAMLS project-scoped pages', () => {
  it('orders Workbenches, Storage and Projects in the sidebar', () => {
    initIntercepts({});
    appChrome.visit();

    appChrome
      .findSideBar()
      .invoke('text')
      .then((text) => {
        const workbenches = text.indexOf('Workbenches');
        const storage = text.indexOf('Storage');
        const projects = text.indexOf('Projects');
        expect(workbenches).to.be.greaterThan(-1);
        expect(workbenches).to.be.lessThan(storage);
        expect(storage).to.be.lessThan(projects);
      });
  });

  it('opens Workbenches from the sidebar on the first project', () => {
    initIntercepts({});
    appChrome.visit();

    appChrome.findNavItem({ name: 'Workbenches' }).click();
    verifyRelativeURL('/workbenches/test-project');
    cy.findByTestId('app-page-title').should('have.text', 'Workbenches');
    workbenchPage.getNotebookRow('CEAMLS Notebook').find().should('exist');
    // The page titles itself; the reused project section must not repeat it.
    cy.get('#workbenches-title').should('not.exist');
    workbenchPage.findCreateButton().should('exist');
  });

  it('offers the project selector for an unknown project', () => {
    initIntercepts({});
    visitPage('/workbenches/not-a-project');

    cy.findByText('Project not found').should('exist');
  });

  it('shows the no-projects state when the user has no projects', () => {
    initIntercepts({ projects: [] });
    visitPage('/workbenches');

    cy.findByTestId('empty-state-title').should('contain.text', 'No projects');
  });

  it('creates a workbench without leaving Workbenches', () => {
    initIntercepts({});
    visitPage('/workbenches/test-project');

    workbenchPage.findCreateButton().click();
    verifyRelativeURL('/workbenches/test-project/spawner');
    createSpawnerPage.shouldHaveAppTitle();
    appChrome.findNavItem({ name: 'Workbenches' }).should('have.attr', 'aria-current', 'page');
    findBreadcrumb().findByRole('link', { name: 'Workbenches' }).click();
    verifyRelativeURL('/workbenches/test-project');

    workbenchPage.findCreateButton().click();
    createSpawnerPage.findCancelButton().click();
    verifyRelativeURL('/workbenches/test-project');
  });

  it('edits a workbench without leaving Workbenches', () => {
    initIntercepts({});
    visitPage('/workbenches/test-project');

    workbenchPage.getNotebookRow('CEAMLS Notebook').findKebabAction('Edit workbench').click();
    verifyRelativeURL('/workbenches/test-project/spawner/ceamls-notebook');
    cy.findByTestId('app-page-title').should('have.text', 'Edit CEAMLS Notebook');
    appChrome.findNavItem({ name: 'Workbenches' }).should('have.attr', 'aria-current', 'page');
    findBreadcrumb()
      .findByRole('link', { name: 'Test Project' })
      .should('have.attr', 'href', '/workbenches/test-project');

    createSpawnerPage.findCancelButton().click();
    verifyRelativeURL('/workbenches/test-project');
  });

  it('opens Storage on the first project', () => {
    initIntercepts({});
    visitPage('/storage');

    verifyRelativeURL('/storage/test-project');
    cy.findByTestId('app-page-title').should('have.text', 'Storage');
    clusterStorage.getClusterStorageRow('CEAMLS Storage').find().should('exist');
    cy.get('#cluster-storages-title').should('not.exist');
    clusterStorage.findAddClusterStorageButton().should('exist');
  });
});
