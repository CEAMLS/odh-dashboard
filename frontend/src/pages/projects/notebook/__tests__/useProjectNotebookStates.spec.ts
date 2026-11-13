import { act } from 'react';
import { testHook } from '@odh-dashboard/jest-config/hooks';
import { mockNotebookK8sResource } from '#~/__mocks__/mockNotebookK8sResource';
import { getNotebooks, getPodsForNotebook } from '#~/api';
import { NotebookKind } from '#~/k8sTypes';
import useK8sWatchResourceList from '#~/utilities/useK8sWatchResourceList';
import useProjectNotebookStates from '#~/pages/projects/notebook/useProjectNotebookStates';

// CEAMLS: the list is read again when the watch reports a change.

jest.mock('#~/api', () => ({
  ...jest.requireActual('#~/api'),
  getNotebooks: jest.fn(),
  getPodsForNotebook: jest.fn(),
}));

jest.mock('#~/utilities/useK8sWatchResourceList', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const getNotebooksMock = jest.mocked(getNotebooks);
const getPodsForNotebookMock = jest.mocked(getPodsForNotebook);
const useWatchMock = jest.mocked(useK8sWatchResourceList);

const namespace = 'test-project';

const notebook = (name: string, resourceVersion: string, deleting = false): NotebookKind => {
  const nb = mockNotebookK8sResource({ name, namespace, uid: `uid-${name}` });
  nb.metadata.resourceVersion = resourceVersion;
  if (deleting) {
    nb.metadata.deletionTimestamp = '2026-11-13T00:00:00Z';
  }
  return nb;
};

/** Lets the pending promises of the read finish. */
const settle = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
};

/** Moves the clock past the wait that joins several changes into one read. */
const passDelay = async () => {
  await act(async () => {
    jest.advanceTimersByTime(350);
  });
  await settle();
};

describe('useProjectNotebookStates', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    getPodsForNotebookMock.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.resetAllMocks();
  });

  it('reads the list once, and not again at the first answer of the watch', async () => {
    const first = [notebook('a', '1')];
    getNotebooksMock.mockResolvedValue(first);
    useWatchMock.mockReturnValue([[], false, undefined]);

    const renderResult = testHook(useProjectNotebookStates)(namespace);
    await settle();
    expect(getNotebooksMock).toHaveBeenCalledTimes(1);
    expect(renderResult.result.current.data.map((s) => s.notebook.metadata.name)).toEqual(['a']);

    useWatchMock.mockReturnValue([first, true, undefined]);
    renderResult.rerender(namespace);
    await passDelay();
    expect(getNotebooksMock).toHaveBeenCalledTimes(1);
  });

  it('reads the list again when the watch reports a workbench marked for removal, then gone', async () => {
    const first = [notebook('a', '1')];
    getNotebooksMock.mockResolvedValue(first);
    useWatchMock.mockReturnValue([first, true, undefined]);

    const renderResult = testHook(useProjectNotebookStates)(namespace);
    await settle();
    expect(getNotebooksMock).toHaveBeenCalledTimes(1);

    // The delete: the object stays, with a deletion time.
    const deleting = [notebook('a', '2', true)];
    getNotebooksMock.mockResolvedValue(deleting);
    useWatchMock.mockReturnValue([deleting, true, undefined]);
    renderResult.rerender(namespace);
    await passDelay();
    expect(getNotebooksMock).toHaveBeenCalledTimes(2);
    expect(renderResult.result.current.data[0].notebook.metadata.deletionTimestamp).toBeDefined();

    // The finalizers finished: the object is gone.
    getNotebooksMock.mockResolvedValue([]);
    useWatchMock.mockReturnValue([[], true, undefined]);
    renderResult.rerender(namespace);
    await passDelay();
    expect(getNotebooksMock).toHaveBeenCalledTimes(3);
    expect(renderResult.result.current.data).toEqual([]);
  });

  it('joins several quick changes into one read', async () => {
    getNotebooksMock.mockResolvedValue([notebook('a', '1')]);
    useWatchMock.mockReturnValue([[notebook('a', '1')], true, undefined]);

    const renderResult = testHook(useProjectNotebookStates)(namespace);
    await settle();

    for (const version of ['2', '3', '4']) {
      useWatchMock.mockReturnValue([[notebook('a', version)], true, undefined]);
      renderResult.rerender(namespace);
      // eslint-disable-next-line no-await-in-loop
      await act(async () => {
        jest.advanceTimersByTime(100);
      });
    }
    await passDelay();
    expect(getNotebooksMock).toHaveBeenCalledTimes(2);
  });

  it('does not read again when the watch gives the same list in a new array', async () => {
    getNotebooksMock.mockResolvedValue([notebook('a', '1')]);
    useWatchMock.mockReturnValue([[notebook('a', '1')], true, undefined]);

    const renderResult = testHook(useProjectNotebookStates)(namespace);
    await settle();

    useWatchMock.mockReturnValue([[notebook('a', '1')], true, undefined]);
    renderResult.rerender(namespace);
    await passDelay();
    expect(getNotebooksMock).toHaveBeenCalledTimes(1);
  });

  it('stays on the timer when the watch never loads', async () => {
    getNotebooksMock.mockResolvedValue([notebook('a', '1')]);
    useWatchMock.mockReturnValue([[], false, new Error('watch refused')]);

    const renderResult = testHook(useProjectNotebookStates)(namespace, { refreshRate: 30000 });
    await settle();
    expect(getNotebooksMock).toHaveBeenCalledTimes(1);
    expect(renderResult.result.current.loaded).toBe(true);
    expect(renderResult.result.current.error).toBeUndefined();

    await act(async () => {
      jest.advanceTimersByTime(30000);
    });
    await settle();
    expect(getNotebooksMock).toHaveBeenCalledTimes(2);
  });
});
