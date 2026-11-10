// CEAMLS: the Resource Allocation block of the project Overview tab:
// what runs in the project now and how much of the quota each thing
// holds. The rows come from the project's pods.
import * as React from 'react';
import { Link } from 'react-router-dom';
import { Alert, Card, CardBody, CardTitle, Content, Skeleton } from '@patternfly/react-core';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { ProjectSectionID } from '#~/pages/projects/screens/detail/types';
import { vmsRoute } from '#~/pages/ceamls/routes';
import { countText, durationText, gibText } from './logic';
import type { Workload } from './logic';

type Props = {
  ns: string;
  loaded: boolean;
  rows: Workload[];
  error?: Error;
  /** A project that has ended: the empty state offers no start links. */
  stopped: boolean;
};

const NONE = '—';

const AllocationCard: React.FC<Props> = ({ ns, loaded, rows, error, stopped }) => {
  // "Running for" moves with the clock.
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const total = rows.reduce(
    (t, w) => ({ gpu: t.gpu + w.gpu, cpu: t.cpu + w.cpu, memory: t.memory + w.memoryBytes }),
    { gpu: 0, cpu: 0, memory: 0 },
  );
  const section = (id: ProjectSectionID) => `/projects/${ns}?section=${id}`;
  return (
    <Card data-testid="ceamls-overview-allocation">
      <CardTitle component="h2">Resource Allocation</CardTitle>
      <CardBody>
        {error ? (
          <Alert variant="warning" isInline isPlain title="The list cannot be read now" />
        ) : !loaded ? (
          <Skeleton height="120px" screenreaderText="Loading what runs in the project" />
        ) : rows.length === 0 ? (
          <Content component="p">
            Nothing runs in the project now, so the full quota is free.
            {!stopped && (
              <>
                {' '}
                Start a <Link to={section(ProjectSectionID.WORKBENCHES)}>workbench</Link>, a{' '}
                <Link to={vmsRoute(ns)}>virtual machine</Link> or a{' '}
                <Link to={section(ProjectSectionID.MODEL_SERVER)}>model deployment</Link>.
              </>
            )}
          </Content>
        ) : (
          <Table variant="compact" aria-label="What runs in the project now">
            <Thead>
              <Tr>
                <Th>Name</Th>
                <Th>Kind</Th>
                <Th>Started by</Th>
                <Th>GPU units</Th>
                <Th>CPU cores</Th>
                <Th>Memory</Th>
                <Th>Running for</Th>
              </Tr>
            </Thead>
            <Tbody>
              {rows.map((w) => (
                <Tr key={`${w.kind}/${w.name}`} data-testid="ceamls-allocation-row">
                  <Td dataLabel="Name" style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
                    {w.name}
                  </Td>
                  <Td dataLabel="Kind">{w.kind}</Td>
                  <Td dataLabel="Started by" style={{ overflowWrap: 'anywhere' }}>
                    {w.startedBy || NONE}
                  </Td>
                  <Td dataLabel="GPU units">{countText(w.gpu)}</Td>
                  <Td dataLabel="CPU cores">{countText(w.cpu)}</Td>
                  <Td dataLabel="Memory">{gibText(w.memoryBytes)}</Td>
                  <Td dataLabel="Running for">
                    {w.startedAt === undefined ? 'Waits to start' : durationText(now - w.startedAt)}
                  </Td>
                </Tr>
              ))}
              <Tr style={{ fontWeight: 600 }} data-testid="ceamls-allocation-total">
                <Td dataLabel="Name">Total</Td>
                <Td />
                <Td />
                <Td dataLabel="GPU units">{countText(total.gpu)}</Td>
                <Td dataLabel="CPU cores">{countText(total.cpu)}</Td>
                <Td dataLabel="Memory">{gibText(total.memory)}</Td>
                <Td />
              </Tr>
            </Tbody>
          </Table>
        )}
      </CardBody>
    </Card>
  );
};

export default AllocationCard;
