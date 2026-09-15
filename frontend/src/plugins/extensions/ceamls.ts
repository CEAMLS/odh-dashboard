import type { NavExtension, RouteExtension } from '@odh-dashboard/plugin-core/extension-points';
// Allow this import as it consists of types and enums only.
// eslint-disable-next-line no-restricted-syntax
import { SupportedArea } from '#~/concepts/areas/types';

// CEAMLS: top-level, project-scoped Workbenches and Storage pages. Kept apart
// from navigation.ts/routes.ts so a rebase onto upstream only has to carry the
// one group changed there (Projects). Top-level order, by group, on 3.6:
//   1 Home, 2 Workbenches, 3 AI hub, 5 Develop & train, 6 Observe & monitor,
//   6_x Storage, 6_y Projects, 7 Learning resources, 8 Applications, 8 Settings
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
      iconRef: () => import('#~/images/icons/WorkbenchesNavIcon'),
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
      group: '6_x_storage',
      iconRef: () => import('#~/images/icons/StorageNavIcon'),
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
