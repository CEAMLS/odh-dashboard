// CEAMLS: what the machine uses: CPU, memory, disk traffic and network
// traffic over the last hour (or 6 or 24), from the cluster's metrics
// through the hub's Prometheus proxy. Loads after the page shows.
import * as React from 'react';
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Content,
  FormSelect,
  FormSelectOption,
  Grid,
  GridItem,
} from '@patternfly/react-core';
import { ChartArea, ChartGroup, ChartVoronoiContainer } from '@patternfly/react-charts/victory';
import type { PrometheusQueryRangeResultValue } from '@odh-dashboard/ui-core/types/metrics';
import usePrometheusQueryRange, {
  defaultResponsePredicate,
} from '#~/api/prometheus/usePrometheusQueryRange';
import { formatBytes } from './api';

/** The chart marks: a lighter navy and the orange, both checked for color vision. */
export const SERIES_A = '#2b5aa8';
export const SERIES_B = '#e07412';

type Range = { label: string; seconds: number; step: number };

const RANGES: Range[] = [
  { label: 'Last hour', seconds: 3600, step: 30 },
  { label: 'Last 6 hours', seconds: 6 * 3600, step: 180 },
  { label: 'Last 24 hours', seconds: 24 * 3600, step: 720 },
];

const REFRESH_MS = 30_000;

type Point = { x: number; y: number };

const toPoints = (values: PrometheusQueryRangeResultValue[]): Point[] =>
  values.map(([t, v]) => ({ x: t * 1000, y: Number(v) })).filter((p) => Number.isFinite(p.y));

const last = (points: Point[]): number | undefined => points.at(-1)?.y;

/** Bytes per second as "1.2 MiB/s". */
const rateText = (v: number | undefined): string => {
  if (v === undefined) {
    return '—';
  }
  if (v < 1024) {
    return `${Math.round(v)} B/s`;
  }
  if (v < 1024 ** 2) {
    return `${Math.round(v / 1024)} KiB/s`;
  }
  return `${formatBytes(v)}/s`;
};

const useSeries = (
  active: boolean,
  ns: string,
  query: string,
  range: Range,
  end: number,
): [Point[], boolean] => {
  const [values, loaded] = usePrometheusQueryRange(
    active,
    '/api/prometheus/queryRange',
    query,
    range.seconds,
    end,
    range.step,
    defaultResponsePredicate,
    ns,
  );
  return [React.useMemo(() => toPoints(values), [values]), loaded];
};

/** A small area chart with a hover reading; no axes, the tile's number is the scale. */
const Sparkline: React.FC<{
  series: { name: string; points: Point[]; color: string; text: (v: number) => string }[];
  title: string;
}> = ({ series, title }) => {
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
  const hasData = series.some((s) => s.points.length > 1);
  return (
    <div ref={holder} style={{ height: 64 }} data-testid="ceamls-usage-chart">
      {hasData ? (
        <ChartGroup
          ariaTitle={title}
          height={64}
          width={width}
          padding={{ top: 4, bottom: 2, left: 0, right: 0 }}
          containerComponent={
            <ChartVoronoiContainer
              labels={({ datum }: { datum: Point & { childName?: string } }) => {
                const s = series.find((x) => x.name === datum.childName) ?? series[0];
                return `${s.name}: ${s.text(datum.y)}\n${new Date(datum.x).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}`;
              }}
              constrainToVisibleArea
              voronoiDimension="x"
            />
          }
        >
          {series.map((s) => (
            <ChartArea
              key={s.name}
              name={s.name}
              data={s.points}
              interpolation="monotoneX"
              style={{
                data: { fill: s.color, fillOpacity: 0.18, stroke: s.color, strokeWidth: 2 },
              }}
            />
          ))}
        </ChartGroup>
      ) : (
        <Content component="small" style={{ lineHeight: '64px' }}>
          No data yet
        </Content>
      )}
    </div>
  );
};

const Tile: React.FC<{
  title: string;
  big: string;
  small?: string;
  legend?: { color: string; text: string }[];
  children: React.ReactNode;
}> = ({ title, big, small, legend, children }) => (
  <div
    data-testid="ceamls-usage-tile"
    style={{
      border: '1px solid var(--pf-t--global--border--color--default)',
      borderRadius: 8,
      padding: '12px 14px',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      minWidth: 0,
    }}
  >
    <Content component="small" style={{ fontWeight: 600 }}>
      {title}
    </Content>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
        {big}
      </span>
      {small && <Content component="small">{small}</Content>}
    </div>
    {children}
    {legend && (
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {legend.map((l) => (
          <Content component="small" key={l.text} style={{ whiteSpace: 'nowrap' }}>
            <span
              aria-hidden
              style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: 4,
                background: l.color,
                marginRight: 6,
                verticalAlign: 'middle',
              }}
            />
            {l.text}
          </Content>
        ))}
      </div>
    )}
  </div>
);

type Props = {
  ns: string;
  name: string;
  /** The machine runs; the charts update while it does. */
  running: boolean;
  cpus?: number;
  memoryBytes?: number;
};

const UsageCard: React.FC<Props> = ({ ns, name, running, cpus, memoryBytes }) => {
  const [rangeIndex, setRangeIndex] = React.useState(0);
  const range = RANGES[rangeIndex];
  // The end of the window moves every 30 s while the machine runs, which
  // re-reads the six series. A stopped machine's charts stay as they are.
  const [end, setEnd] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!running) {
      return undefined;
    }
    const id = setInterval(() => setEnd(Date.now()), REFRESH_MS);
    return () => clearInterval(id);
  }, [running]);

  const sel = `{namespace="${ns}",name="${name}"}`;
  const q = (expr: string) => expr.replaceAll('$M', sel);
  const [cpu] = useSeries(
    true,
    ns,
    q('sum(rate(kubevirt_vmi_cpu_usage_seconds_total$M[2m]))'),
    range,
    end,
  );
  const [mem] = useSeries(true, ns, q('sum(kubevirt_vmi_memory_used_bytes$M)'), range, end);
  const [read] = useSeries(
    true,
    ns,
    q('sum(rate(kubevirt_vmi_storage_read_traffic_bytes_total$M[2m]))'),
    range,
    end,
  );
  const [write] = useSeries(
    true,
    ns,
    q('sum(rate(kubevirt_vmi_storage_write_traffic_bytes_total$M[2m]))'),
    range,
    end,
  );
  const [rx] = useSeries(
    true,
    ns,
    q('sum(rate(kubevirt_vmi_network_receive_bytes_total$M[2m]))'),
    range,
    end,
  );
  const [tx] = useSeries(
    true,
    ns,
    q('sum(rate(kubevirt_vmi_network_transmit_bytes_total$M[2m]))'),
    range,
    end,
  );

  const cpuNow = last(cpu);
  const cpuPct = cpuNow !== undefined && cpus ? Math.round((cpuNow / cpus) * 100) : undefined;
  const cpuPoints = React.useMemo(
    () => (cpus ? cpu.map((p) => ({ x: p.x, y: (p.y / cpus) * 100 })) : cpu),
    [cpu, cpus],
  );
  const memNow = last(mem);

  return (
    <Card>
      <CardHeader
        actions={{
          actions: (
            <FormSelect
              value={String(rangeIndex)}
              onChange={(_e, v) => setRangeIndex(Number(v))}
              aria-label="Range"
              id="ceamls-usage-range"
              style={{ width: 'auto' }}
            >
              {RANGES.map((r, i) => (
                <FormSelectOption key={r.label} value={String(i)} label={r.label} />
              ))}
            </FormSelect>
          ),
          hasNoOffset: true,
        }}
      >
        <CardTitle>Usage</CardTitle>
      </CardHeader>
      <CardBody>
        <Grid hasGutter>
          <GridItem md={6} xl={3}>
            <Tile
              title="CPU"
              big={
                cpuPct !== undefined
                  ? `${cpuPct} %`
                  : cpuNow !== undefined
                  ? `${cpuNow.toFixed(2)} CPUs`
                  : '—'
              }
              small={cpus ? `of ${cpus} ${cpus === 1 ? 'CPU' : 'CPUs'}` : undefined}
            >
              <Sparkline
                title="CPU use"
                series={[
                  {
                    name: 'CPU',
                    points: cpuPoints,
                    color: SERIES_A,
                    text: (v) => (cpus ? `${Math.round(v)} %` : `${v.toFixed(2)} CPUs`),
                  },
                ]}
              />
            </Tile>
          </GridItem>
          <GridItem md={6} xl={3}>
            <Tile
              title="Memory"
              big={memNow !== undefined ? formatBytes(memNow) : '—'}
              small={memoryBytes ? `of ${formatBytes(memoryBytes)}` : undefined}
            >
              <Sparkline
                title="Memory in use"
                series={[{ name: 'Memory', points: mem, color: SERIES_A, text: formatBytes }]}
              />
            </Tile>
          </GridItem>
          <GridItem md={6} xl={3}>
            <Tile
              title="Disk"
              big={rateText(last(read))}
              small={`read · ${rateText(last(write))} write`}
              legend={[
                { color: SERIES_A, text: 'Read' },
                { color: SERIES_B, text: 'Write' },
              ]}
            >
              <Sparkline
                title="Disk traffic"
                series={[
                  { name: 'Read', points: read, color: SERIES_A, text: rateText },
                  { name: 'Write', points: write, color: SERIES_B, text: rateText },
                ]}
              />
            </Tile>
          </GridItem>
          <GridItem md={6} xl={3}>
            <Tile
              title="Network"
              big={rateText(last(rx))}
              small={`in · ${rateText(last(tx))} out`}
              legend={[
                { color: SERIES_A, text: 'In' },
                { color: SERIES_B, text: 'Out' },
              ]}
            >
              <Sparkline
                title="Network traffic"
                series={[
                  { name: 'In', points: rx, color: SERIES_A, text: rateText },
                  { name: 'Out', points: tx, color: SERIES_B, text: rateText },
                ]}
              />
            </Tile>
          </GridItem>
        </Grid>
        <Content component="small" className="pf-v6-u-mt-sm">
          {running
            ? 'Updates every 30 seconds.'
            : 'The machine is not running. The charts show its last run.'}
        </Content>
      </CardBody>
    </Card>
  );
};

export default UsageCard;
