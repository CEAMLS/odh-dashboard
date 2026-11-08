// CEAMLS: what the cluster did with the machine lately: its events, newest
// first, with a word filter and a problems-only switch. The cluster keeps
// events for about three hours, so this is a window, not a history.
import * as React from 'react';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Content,
  Flex,
  FlexItem,
  FormSelect,
  FormSelectOption,
  SearchInput,
  Icon,
  Timestamp,
  TimestampTooltipVariant,
} from '@patternfly/react-core';
import { ExclamationCircleIcon, InfoCircleIcon } from '@patternfly/react-icons';
import { eventTime, sortEvents, useVmEvents } from './api';
import type { EventKind } from './types';

const FOLDED_ROWS = 10;

type Props = {
  ns: string;
  name: string;
  /** Open at first: the machine is not running, so the reader wants to know why. */
  openAtFirst: boolean;
};

const Row: React.FC<{ event: EventKind }> = ({ event }) => {
  const t = eventTime(event);
  const warning = event.type === 'Warning';
  return (
    <tr data-testid="ceamls-activity-row">
      <td style={{ whiteSpace: 'nowrap', verticalAlign: 'top', paddingRight: 12 }}>
        {t ? (
          <Timestamp date={new Date(t)} tooltip={{ variant: TimestampTooltipVariant.default }}>
            <Content component="small">
              {new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Content>
          </Timestamp>
        ) : (
          <Content component="small">—</Content>
        )}
      </td>
      <td style={{ whiteSpace: 'nowrap', verticalAlign: 'top', paddingRight: 12 }}>
        <Content component="small" style={{ whiteSpace: 'nowrap' }}>
          <Icon status={warning ? 'danger' : 'info'} isInline>
            {warning ? <ExclamationCircleIcon /> : <InfoCircleIcon />}
          </Icon>{' '}
          {event.reason ?? (warning ? 'Problem' : 'Event')}
        </Content>
      </td>
      <td style={{ verticalAlign: 'top' }}>
        <Content component="small">
          {event.message}
          {event.count && event.count > 1 ? ` (${event.count} times)` : ''}
          {event.involvedObject.kind && event.involvedObject.kind !== 'VirtualMachine'
            ? ` · ${
                event.involvedObject.kind === 'VirtualMachineInstance'
                  ? 'instance'
                  : event.involvedObject.kind === 'DataVolume'
                  ? 'disk'
                  : event.involvedObject.kind.toLowerCase()
              }`
            : ''}
        </Content>
      </td>
    </tr>
  );
};

const ActivityCard: React.FC<Props> = ({ ns, name, openAtFirst }) => {
  const [events, loaded] = useVmEvents(ns, name);
  const [open, setOpen] = React.useState(openAtFirst);
  const [word, setWord] = React.useState('');
  const [problemsOnly, setProblemsOnly] = React.useState(false);
  const [all, setAll] = React.useState(false);

  const rows = React.useMemo(() => {
    const w = word.trim().toLowerCase();
    return sortEvents(events).filter(
      (e) =>
        (!problemsOnly || e.type === 'Warning') &&
        (!w || `${e.reason ?? ''} ${e.message ?? ''}`.toLowerCase().includes(w)),
    );
  }, [events, word, problemsOnly]);
  const shown = all ? rows : rows.slice(0, FOLDED_ROWS);
  const problems = events.filter((e) => e.type === 'Warning').length;

  return (
    <Card>
      <CardHeader
        actions={{
          actions: (
            <Flex gap={{ default: 'gapSm' }} alignItems={{ default: 'alignItemsCenter' }}>
              {open && (
                <>
                  <FlexItem>
                    <SearchInput
                      placeholder="Filter by word"
                      value={word}
                      onChange={(_e, v) => setWord(v)}
                      onClear={() => setWord('')}
                      aria-label="Filter the activity by word"
                      data-testid="ceamls-activity-filter"
                    />
                  </FlexItem>
                  <FlexItem>
                    <FormSelect
                      value={problemsOnly ? 'problems' : 'all'}
                      onChange={(_e, v) => setProblemsOnly(v === 'problems')}
                      aria-label="Which events"
                      id="ceamls-activity-kind"
                      style={{ width: 'auto' }}
                    >
                      <FormSelectOption value="all" label="All" />
                      <FormSelectOption value="problems" label="Problems only" />
                    </FormSelect>
                  </FlexItem>
                </>
              )}
              <FlexItem>
                <Button
                  variant="link"
                  isInline
                  onClick={() => setOpen((o) => !o)}
                  data-testid="ceamls-activity-toggle"
                >
                  {open ? 'Hide' : `Show (${events.length})`}
                </Button>
              </FlexItem>
            </Flex>
          ),
          hasNoOffset: true,
        }}
      >
        <CardTitle>
          Activity
          {!open && problems > 0 ? (
            <Content component="small" className="pf-v6-u-ml-sm pf-v6-u-font-weight-normal">
              {problems} {problems === 1 ? 'problem' : 'problems'}
            </Content>
          ) : null}
        </CardTitle>
      </CardHeader>
      {open && (
        <CardBody>
          {!loaded ? (
            <Content component="small">Loading…</Content>
          ) : rows.length === 0 ? (
            <Content component="small">
              {events.length === 0
                ? 'Nothing in the last three hours.'
                : 'Nothing matches the filter.'}
            </Content>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 6px' }}>
              <tbody>
                {shown.map((e) => (
                  <Row
                    key={e.metadata?.uid ?? `${e.reason ?? ''}-${eventTime(e) ?? ''}`}
                    event={e}
                  />
                ))}
              </tbody>
            </table>
          )}
          <Flex gap={{ default: 'gapMd' }} className="pf-v6-u-mt-sm">
            {rows.length > FOLDED_ROWS && (
              <FlexItem>
                <Button
                  variant="link"
                  isInline
                  onClick={() => setAll((a) => !a)}
                  data-testid="ceamls-activity-all"
                >
                  {all ? `Show the first ${FOLDED_ROWS}` : `Show all (${rows.length})`}
                </Button>
              </FlexItem>
            )}
            <FlexItem>
              <Content component="small">
                {rows.length > FOLDED_ROWS && !all
                  ? `Showing ${FOLDED_ROWS} of ${rows.length}. `
                  : ''}
                The cluster keeps events for about three hours.
              </Content>
            </FlexItem>
          </Flex>
        </CardBody>
      )}
    </Card>
  );
};

export default ActivityCard;
