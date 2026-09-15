import * as React from 'react';
import { ProjectSectionID } from '#~/pages/projects/screens/detail/types';
import { workbenchesRoute } from './routes';

/**
 * CEAMLS: where the workbench list, create and edit pages link to. Project
 * pages keep the upstream /projects paths (the default). The top-level
 * Workbenches page provides its own, so users stay under /workbenches while
 * they create or edit a workbench.
 */
export type WorkbenchPaths = {
  /** Breadcrumb root. */
  root: string;
  rootLabel: string;
  /** Breadcrumb project link and "Return to project". */
  project: (namespace: string) => string;
  /** Where create, update and cancel return to. */
  list: (namespace: string) => string;
  create: (namespace: string) => string;
  edit: (namespace: string, notebookName: string) => string;
};

export const projectWorkbenchPaths: WorkbenchPaths = {
  root: '/projects',
  rootLabel: 'Projects',
  project: (namespace) => `/projects/${namespace}`,
  list: (namespace) => `/projects/${namespace}?section=${ProjectSectionID.WORKBENCHES}`,
  create: (namespace) => `/projects/${namespace}/spawner`,
  edit: (namespace, notebookName) => `/projects/${namespace}/spawner/${notebookName}`,
};

export const workbenchesPageWorkbenchPaths: WorkbenchPaths = {
  root: workbenchesRoute(),
  rootLabel: 'Workbenches',
  project: (namespace) => workbenchesRoute(namespace),
  list: (namespace) => workbenchesRoute(namespace),
  create: (namespace) => `${workbenchesRoute(namespace)}/spawner`,
  edit: (namespace, notebookName) => `${workbenchesRoute(namespace)}/spawner/${notebookName}`,
};

export const WorkbenchPathsContext = React.createContext<WorkbenchPaths>(projectWorkbenchPaths);
