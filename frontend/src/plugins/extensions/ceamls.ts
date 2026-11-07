import type { NavExtension, RouteExtension } from '@odh-dashboard/plugin-core/extension-points';
import { SupportedArea } from '@odh-dashboard/plugin-core/areas';

// CEAMLS: top-level, project-scoped pages (Workbenches, Virtual machines,
// Storage > Volumes and Buckets) and the CEAMLS Chat item. Kept apart from navigation.ts/routes.ts
// so a rebase onto upstream only has to carry the one group changed there
// (Projects, which is also the landing page; there is no Home entry).
// Top-level order, by group, on 3.6:
//   1 Projects, 2 Workbenches, 2_x Virtual machines, 3 AI hub, 5 Develop & train,
//   6 Observe & monitor, 6_x Storage (Volumes, Buckets), 7 Learning resources, 7_x CEAMLS Chat,
//   8 Applications, 8 Settings
// CEAMLS Chat is an outside address: NavItemHref renders it as a link that
// opens a new tab. Plan: planning/hub_pages.md in the cluster repo.
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
      id: 'ceamls-vms',
      title: 'Virtual machines',
      href: '/vms',
      path: '/vms/*',
      group: '2_x_vms',
      iconRef: () => import('#~/images/icons/VirtualMachinesNavIcon'),
    },
  },
  {
    type: 'app.navigation/section',
    flags: {
      required: [SupportedArea.DS_PROJECTS_VIEW],
    },
    properties: {
      id: 'ceamls-storage',
      title: 'Storage',
      group: '6_x_storage',
      iconRef: () => import('#~/images/icons/StorageNavIcon'),
    },
  },
  {
    type: 'app.navigation/href',
    flags: {
      required: [SupportedArea.DS_PROJECTS_VIEW],
    },
    properties: {
      id: 'ceamls-volumes',
      title: 'Volumes',
      href: '/storage/volumes',
      path: '/storage/volumes/*',
      section: 'ceamls-storage',
      group: '1_volumes',
    },
  },
  {
    type: 'app.navigation/href',
    flags: {
      required: [SupportedArea.DS_PROJECTS_VIEW],
    },
    properties: {
      id: 'ceamls-buckets',
      title: 'Buckets',
      href: '/storage/buckets',
      path: '/storage/buckets/*',
      section: 'ceamls-storage',
      group: '2_buckets',
    },
  },
  {
    type: 'app.navigation/href',
    properties: {
      id: 'ceamls-chat',
      title: 'CEAMLS Chat',
      href: 'https://chat.apps.ceamls.morgan.edu/',
      group: '7_x_chat',
      iconRef: () => import('#~/images/icons/ChatNavIcon'),
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
      path: '/vms/*',
      component: () => import('#~/pages/ceamls/vms/GlobalVmsRoutes'),
    },
  },
  {
    type: 'app.route',
    flags: {
      required: [SupportedArea.DS_PROJECTS_VIEW],
    },
    properties: {
      path: '/storage/volumes/*',
      component: () => import('#~/pages/ceamls/storage/GlobalStorageRoutes'),
    },
  },
  {
    type: 'app.route',
    flags: {
      required: [SupportedArea.DS_PROJECTS_VIEW],
    },
    properties: {
      path: '/storage/buckets/*',
      component: () => import('#~/pages/ceamls/buckets/GlobalBucketsRoutes'),
    },
  },
  {
    // Old links to /storage/<project> go to /storage/volumes/<project>.
    type: 'app.route',
    flags: {
      required: [SupportedArea.DS_PROJECTS_VIEW],
    },
    properties: {
      path: '/storage/*',
      component: () => import('#~/pages/ceamls/storage/LegacyStorageRedirect'),
    },
  },
];

export default extensions;
