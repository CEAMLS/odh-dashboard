import type { NavExtension, RouteExtension } from '@odh-dashboard/plugin-core/extension-points';
// Allow this import as it consists of types and enums only.
// eslint-disable-next-line no-restricted-syntax
import { SupportedArea } from '#~/concepts/areas/types';

// CEAMLS: top-level, project-scoped Workbenches and Storage pages. Kept apart
// from navigation.ts/routes.ts so a rebase onto upstream only has to carry the
// titles and groups changed there. Top-level order, by group:
//   1 Home, 2 Workbenches, 3 Pipelines, 4 Models, 5 Experiments,
//   6 Distributed workloads, 7 Storage, 8 Projects, 9 Applications/Resources,
//   10 Settings
const extensions: (NavExtension | RouteExtension)[] = [
  {
    type: 'app.navigation/href',
    flags: {
      required: [SupportedArea.WORKBENCHES],
    },
    properties: {
      id: 'ceamls-workbenches',
      title: 'Workbenches',
      href: '/workbenches',
      path: '/workbenches/*',
      group: '2_workbenches',
    },
  },
  {
    type: 'app.navigation/href',
    flags: {
      required: [SupportedArea.DS_PROJECTS_VIEW],
    },
    properties: {
      id: 'ceamls-storage',
      title: 'Storage',
      href: '/storage',
      path: '/storage/*',
      group: '7_storage',
    },
  },
  {
    type: 'app.route',
    flags: {
      required: [SupportedArea.WORKBENCHES],
    },
    properties: {
      path: '/workbenches/*',
      component: () => import('#~/pages/ceamls/workbenches/GlobalWorkbenchesRoutes'),
    },
  },
  {
    type: 'app.route',
    flags: {
      required: [SupportedArea.DS_PROJECTS_VIEW],
    },
    properties: {
      path: '/storage/*',
      component: () => import('#~/pages/ceamls/storage/GlobalStorageRoutes'),
    },
  },
];

export default extensions;
