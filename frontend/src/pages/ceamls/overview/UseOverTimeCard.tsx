// CEAMLS: the Usage Over Time block of the project Overview tab: how much
// of the quota the project held over the last days. The numbers are the
// "used" values of the project's ResourceQuota, which the cluster's
// metrics keep for 30 days. They show what the project reserved, not
// how hard the hardware worked.
import * as React from 'react';
import {
  Card,
  CardBody,
  Content,
  FormSelect,
  FormSelectOption,
  Grid,
  GridItem,
} from '@patternfly/react-core';
import {
  ChartArea,
  ChartGroup,
  ChartLine,
  ChartVoronoiContainer,
} from '@patternfly/react-charts/victory';
import type { PrometheusQueryRangeResultValue } from '@odh-dashboard/ui-core/types/metrics';
import usePrometheusQueryRange, {
  defaultResponsePredicate,
} from '#~/api/prometheus/usePrometheusQueryRange';
import { SERIES_A, SERIES_B } from '#~/pages/ceamls/vms/UsageCard';
import { countText, gibText, unitHours } from './logic';
import type { Point } from './logic';
import CardHead from './CardHead';

type Range = { label: string; words: string; seconds: number; step: number };

const DAY = 24 * 3600;

const RANGES: Range[] = [
  { label: 'Last 7 days', words: 'the last 7 days', seconds: 7 * DAY, step: 3600 },
  { label: 'Last 30 days', words: 'the last 30 days', seconds: 30 * DAY, step: 3 * 3600 },
];

const toPoints = (values: PrometheusQueryRangeResultValue[]): Point[] =>
  values.map(([t, v]) => ({ x: t * 1000, y: Number(v) })).filter((p) => Number.isFinite(p.y));

const useSeries = (
  ns: string,
  resource: string,
  type: 'used' | 'hard',
  range: Range,
  end: number,
): Point[] => {
  const [values] = usePrometheusQueryRange(
    true,
    '/api/prometheus/queryRange',
    `max(kube_resourcequota{namespace="${ns}",resource="${resource}",type="${type}"})`,
    range.seconds,
    end,
    range.step,
    defaultResponsePredicate,
    ns,
  );
  return React.useMemo(() => toPoints(values), [values]);
};

type Series = { name: string; points: Point[]; color: string; dashed?: boolean };

const when = (ms: number): string =>
  new Date(ms).toLocaleString([], {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

const TimeChart: React.FC<{
  title: string;
  height: number;
  series: Series[];
  text: (v: number) => string;
}> = ({ title, height, series, text }) => {
  const holder = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(300);
  React.useEffect(() => {
    if (!holder.current) {
      return undefined;
    }
    const ro = new ResizeObserver(() => {
      if (holder.current) {
        setWidth(Math.max(120, holder.current.clientWidth));
      }
    });
    ro.observe(holder.current);
    return () => ro.disconnect();
  }, []);
  const hasData = series.some((s) => !s.dashed && s.points.length > 1);
  const top = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.y)));
  return (
    <div ref={holder} style={{ height }} data-testid="ceamls-use-chart">
      {hasData ? (
        <ChartGroup
          ariaTitle={title}
          height={height}
          width={width}
          padding={{ top: 6, bottom: 2, left: 0, right: 0 }}
          domain={{ y: [0, top * 1.05] }}
          containerComponent={
            <ChartVoronoiContainer
              labels={({ datum }: { datum: Point & { childName?: string } }) =>
                `${datum.childName ?? ''}: ${text(datum.y)}\n${when(datum.x)}`
              }
              constrainToVisibleArea
              voronoiDimension="x"
            />
          }
        >
          {series.map((s) =>
            s.dashed ? (
              <ChartLine
                key={s.name}
                name={s.name}
                data={s.points}
                interpolation="stepAfter"
                style={{ data: { stroke: s.color, strokeWidth: 2, strokeDasharray: '6,4' } }}
              />
            ) : (
              <ChartArea
                key={s.name}
                name={s.name}
                data={s.points}
                interpolation="stepAfter"
                style={{
                  data: { fill: s.color, fillOpacity: 0.18, stroke: s.color, strokeWidth: 2 },
                }}
              />
            ),
          )}
        </ChartGroup>
      ) : (
        <Content component="small" style={{ lineHeight: `${height}px` }}>
          No data yet
        </Content>
      )}
    </div>
  );
};

const Legend: React.FC<{ items: { color: string; text: string }[] }> = ({ items }) => (
  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
    {items.map((l) => (
      <Content component="small" key={l.text} style={{ whiteSpace: 'nowrap' }}>
        <span
          aria-hidden
          style={{
            display: 'inline-block',
            width: 12,
            height: 3,
            background: l.color,
            marginRight: 6,
            verticalAlign: 'middle',
          }}
        />
        {l.text}
      </Content>
    ))}
  </div>
);

const peak = (points: Point[]): number => points.reduce((m, p) => Math.max(m, p.y), 0);

const SmallSeries: React.FC<{
  title: string;
  used: Point[];
  hard: Point[];
  text: (v: number) => string;
}> = ({ title, used, hard, text }) => (
  <div
    style={{
      border: '1px solid var(--pf-t--global--border--color--default)',
      borderRadius: 8,
      padding: '12px 14px',
      height: '100%',
    }}
  >
    <Content component="small" style={{ fontWeight: 600 }}>
      {title}
    </Content>
    <div style={{ fontVariantNumeric: 'tabular-nums' }}>
      {used.length ? (
        <>
          The most in use: <b>{text(peak(used))}</b>
          {hard.length ? ` of ${text(hard[hard.length - 1].y)}` : ''}
        </>
      ) : (
        'No data yet'
      )}
    </div>
    <TimeChart
      title={title}
      height={64}
      text={text}
      series={[
        { name: 'In use', points: used, color: SERIES_A },
        { name: 'Quota', points: hard, color: SERIES_B, dashed: true },
      ]}
    />
  </div>
);

const UseOverTimeCard: React.FC<{ ns: string }> = ({ ns }) => {
  const [rangeIndex, setRangeIndex] = React.useState(1);
  const range = RANGES[rangeIndex];
  const [end] = React.useState(() => Date.now());
  const gpu = useSeries(ns, 'requests.nvidia.com/gpu', 'used', range, end);
  const gpuHard = useSeries(ns, 'requests.nvidia.com/gpu', 'hard', range, end);
  const cpu = useSeries(ns, 'requests.cpu', 'used', range, end);
  const cpuHard = useSeries(ns, 'requests.cpu', 'hard', range, end);
  const mem = useSeries(ns, 'requests.memory', 'used', range, end);
  const memHard = useSeries(ns, 'requests.memory', 'hard', range, end);

  const hasGpu = peak(gpuHard) > 0;
  const hours = unitHours(gpu, range.step);
  const allowed = unitHours(gpuHard, range.step);
  const share = allowed ? Math.round((hours / allowed) * 100) : 0;

  return (
    <Card data-testid="ceamls-overview-use">
      <CardHead title="Usage Over Time">
        {/* The select fills its box, so the box is as wide as the text. */}
        <div style={{ flex: '0 0 auto' }}>
          <FormSelect
            value={String(rangeIndex)}
            onChange={(_e, v) => setRangeIndex(Number(v))}
            aria-label="Range"
            id="ceamls-use-range"
            style={{ width: 'auto' }}
          >
            {RANGES.map((r, i) => (
              <FormSelectOption key={r.label} value={String(i)} label={r.label} />
            ))}
          </FormSelect>
        </div>
      </CardHead>
      <CardBody>
        <Grid hasGutter>
          <GridItem span={12}>
            <Content component="small" style={{ fontWeight: 600 }}>
              GPU units in use
            </Content>
            {hasGpu ? (
              <>
                <Content component="p" data-testid="ceamls-use-sentence">
                  <b>{countText(Math.round(hours))} GPU unit hours</b> in {range.words}. That is{' '}
                  {share} % of what the quota allows.
                </Content>
                <TimeChart
                  title="GPU units in use"
                  height={140}
                  text={(v) => `${countText(v)} GPU units`}
                  series={[
                    { name: 'In use', points: gpu, color: SERIES_A },
                    { name: 'Quota', points: gpuHard, color: SERIES_B, dashed: true },
                  ]}
                />
                <Legend
                  items={[
                    { color: SERIES_A, text: 'In use' },
                    { color: SERIES_B, text: 'Quota' },
                  ]}
                />
              </>
            ) : (
              <Content component="p">
                {gpuHard.length ? `The project had no GPU quota in ${range.words}.` : 'No data yet'}
              </Content>
            )}
          </GridItem>
          <GridItem md={6}>
            <SmallSeries
              title="CPU cores in use"
              used={cpu}
              hard={cpuHard}
              text={(v) => `${countText(v)} cores`}
            />
          </GridItem>
          <GridItem md={6}>
            <SmallSeries title="Memory in use" used={mem} hard={memHard} text={gibText} />
          </GridItem>
        </Grid>
        <Content component="small" className="pf-v6-u-mt-sm">
          The charts show what the project reserved from its quota. A workbench that runs with no
          work in it still counts. The cluster keeps these numbers for 30 days.
        </Content>
      </CardBody>
    </Card>
  );
};

export default UseOverTimeCard;
