import {
  dateText,
  durationText,
  quotaRows,
  unitHours,
  workloads,
} from '#~/pages/ceamls/overview/logic';
import type { PodLite } from '#~/pages/ceamls/overview/logic';

const STORAGE = 'requests.storage';

describe('quotaRows', () => {
  const hard = {
    'requests.nvidia.com/gpu': '8',
    'requests.cpu': '16',
    'requests.memory': '128Gi',
    [STORAGE]: '200Gi',
  };
  const used = {
    'requests.nvidia.com/gpu': '8',
    'requests.cpu': '3615m',
    'requests.memory': '17126788800',
    [STORAGE]: '185Gi',
  };
  const rows = quotaRows(hard, used);
  const by = (key: string) => rows.find((r) => r.key === key);

  it('says full, almost full and free', () => {
    expect(by('gpu')).toMatchObject({ state: 'full', usedText: '8', totalText: '8', percent: 100 });
    expect(by('storage')).toMatchObject({ state: 'almost', usedText: '185', totalText: '200 GiB' });
    expect(by('cpu')).toMatchObject({ state: 'ok', usedText: '3.6', freeText: '12.4 free' });
    expect(by('memory')).toMatchObject({ usedText: '16', totalText: '128 GiB' });
  });

  it('has one storage row, and no row for buckets', () => {
    expect(rows.map((r) => r.key)).toEqual(['gpu', 'cpu', 'memory', 'storage']);
  });
});

const pod = (
  name: string,
  labels: Record<string, string>,
  requests: Record<string, string>,
  extra: Partial<PodLite> = {},
): PodLite => ({
  apiVersion: 'v1',
  kind: 'Pod',
  metadata: { name, labels, ...extra.metadata },
  spec: { containers: [{ resources: { requests } }] },
  status: { phase: 'Running', startTime: '2026-11-09T10:00:00Z', ...extra.status },
});

describe('workloads', () => {
  it('makes one row per workbench, machine and deployment', () => {
    const rows = workloads([
      pod(
        'nb-0',
        { 'notebook-name': 'nb' },
        { cpu: '2', memory: '8Gi', 'nvidia.com/gpu': '1' },
        {
          metadata: { annotations: { 'opendatahub.io/username': 'kofi@morgan.edu' } },
        },
      ),
      pod(
        'virt-launcher-vm1-abc',
        { 'vm.kubevirt.io/name': 'vm1' },
        { cpu: '500m', memory: '4Gi' },
      ),
      pod(
        'glm-0',
        { 'app.kubernetes.io/part-of': 'llminferenceservice', 'app.kubernetes.io/name': 'glm' },
        { cpu: '8', memory: '64Gi', 'nvidia.com/gpu': '4' },
      ),
      pod(
        'glm-0-1',
        { 'app.kubernetes.io/part-of': 'llminferenceservice', 'app.kubernetes.io/name': 'glm' },
        { cpu: '8', memory: '64Gi', 'nvidia.com/gpu': '4' },
        { status: { phase: 'Running', startTime: '2026-11-08T10:00:00Z' } },
      ),
      pod('ds-pipeline-1', { component: 'data-science-pipelines' }, { cpu: '250m' }),
      pod('mariadb-1', { component: 'data-science-pipelines' }, { cpu: '250m' }),
      pod('done', { 'notebook-name': 'old' }, { cpu: '1' }, { status: { phase: 'Succeeded' } }),
      pod(
        'web-5d9-x',
        {},
        { cpu: '100m' },
        {
          metadata: {
            ownerReferences: [
              { apiVersion: 'apps/v1', kind: 'ReplicaSet', name: 'web-5d9', uid: 'u' },
            ],
          },
        },
      ),
    ]);
    expect(rows.map((r) => [r.kind, r.name])).toEqual([
      ['Workbench', 'nb'],
      ['Virtual machine', 'vm1'],
      ['Model deployment', 'glm'],
      ['Pipeline server', 'Pipeline server'],
      ['Other', 'web'],
    ]);
    expect(rows[0]).toMatchObject({ startedBy: 'kofi@morgan.edu', gpu: 1, cpu: 2 });
    expect(rows[2]).toMatchObject({
      gpu: 8,
      cpu: 16,
      startedAt: Date.parse('2026-11-08T10:00:00Z'),
    });
    expect(rows[3].cpu).toBe(0.5);
  });

  it('keeps a pod that waits, with no start time', () => {
    const rows = workloads([
      pod(
        'nb-0',
        { 'notebook-name': 'nb' },
        { cpu: '1' },
        { status: { phase: 'Pending', startTime: undefined } },
      ),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].startedAt).toBeUndefined();
  });
});

describe('text', () => {
  it('writes durations', () => {
    expect(durationText(8 * 60_000)).toBe('8 min');
    expect(durationText((5 * 60 + 12) * 60_000)).toBe('5 h 12 min');
    expect(durationText((3 * 24 + 4) * 3_600_000)).toBe('3 d 4 h');
    expect(durationText(2 * 24 * 3_600_000)).toBe('2 d');
  });

  it('writes dates', () => {
    expect(dateText('2026-06-01')).toBe('1 June 2026');
    expect(dateText('2027-05-31T00:00:00Z')).toBe('31 May 2027');
  });

  it('adds unit hours', () => {
    // 4 units over two samples 3 hours apart, then none.
    expect(
      unitHours(
        [
          { x: 0, y: 4 },
          { x: 1, y: 4 },
          { x: 2, y: 0 },
        ],
        3 * 3600,
      ),
    ).toBe(24);
  });
});
