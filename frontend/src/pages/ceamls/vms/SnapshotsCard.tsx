// CEAMLS: copies of the machine's disk at a moment: take one, put the disk
// back to one, delete one. Five per machine at most; they are not in the
// project's quota.
import * as React from 'react';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Content,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  TextInput,
  Timestamp,
} from '@patternfly/react-core';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { ContentModal } from '@odh-dashboard/ui-core';
import { ConfirmDeleteModal } from '#~/pages/ceamls/buckets/common';
import {
  NAME_RE,
  SNAPSHOT_CAP,
  SNAPSHOT_NOTE,
  createSnapshot,
  defaultSnapshotName,
  deleteSnapshot,
  errorMessage,
  restoreSnapshot,
  snapshotState,
  useSnapshots,
} from './api';
import type { VirtualMachineSnapshotKind } from './types';
import VmStateLabel from './VmState';

const when = (s: VirtualMachineSnapshotKind): string | undefined =>
  s.status?.creationTime ?? s.metadata?.creationTimestamp;

const TakeModal: React.FC<{
  ns: string;
  vm: string;
  taken: string[];
  onClose: () => void;
}> = ({ ns, vm, taken, onClose }) => {
  const [name, setName] = React.useState(() => defaultSnapshotName(vm, taken));
  const [note, setNote] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const nameOk = NAME_RE.test(name) && name.length <= 63;
  const dup = taken.includes(name);
  const run = () => {
    setBusy(true);
    setError(undefined);
    createSnapshot(ns, vm, name, note)
      .then(onClose)
      .catch((e: unknown) => {
        setError(errorMessage(e));
        setBusy(false);
      });
  };
  return (
    <ContentModal
      variant="small"
      title={`Take a snapshot of ${vm}`}
      onClose={onClose}
      dataTestId="ceamls-snapshot-take"
      error={error}
      alertTitle="The request failed"
      contents={
        <Form
          onSubmit={(e) => {
            e.preventDefault();
            if (nameOk && !dup && !busy) {
              run();
            }
          }}
        >
          <Content component="p">
            A copy of the disk at this moment. The machine keeps running. Restore puts the disk back
            to this copy.
          </Content>
          <FormGroup label="Name" isRequired fieldId="ceamls-snapshot-name">
            <TextInput
              id="ceamls-snapshot-name"
              value={name}
              onChange={(_e, v) => setName(v)}
              validated={nameOk && !dup ? 'default' : 'error'}
              aria-label="Snapshot name"
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem variant={nameOk && !dup ? 'default' : 'error'}>
                  {dup
                    ? 'A snapshot with this name exists.'
                    : 'Lowercase letters, digits and dashes.'}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>
          <FormGroup label="Note" fieldId="ceamls-snapshot-note">
            <TextInput
              id="ceamls-snapshot-note"
              value={note}
              onChange={(_e, v) => setNote(v)}
              placeholder="Before the CUDA upgrade"
              aria-label="Snapshot note"
            />
          </FormGroup>
          <Content component="small">
            {taken.length + 1} of {SNAPSHOT_CAP} after this one.
            {taken.length + 1 >= SNAPSHOT_CAP ? ' Delete an old snapshot before the next.' : ''}
          </Content>
        </Form>
      }
      buttonActions={[
        {
          label: 'Take snapshot',
          onClick: run,
          variant: 'primary',
          isDisabled: !nameOk || dup || busy,
          isLoading: busy,
          dataTestId: 'ceamls-snapshot-take-confirm',
        },
        { label: 'Cancel', onClick: onClose, variant: 'link', isDisabled: busy },
      ]}
    />
  );
};

const RestoreModal: React.FC<{
  ns: string;
  vm: string;
  snapshot: VirtualMachineSnapshotKind;
  running: boolean;
  onStart: () => void;
  onDone: (error?: string) => void;
  onClose: () => void;
}> = ({ ns, vm, snapshot, running, onStart, onDone, onClose }) => {
  const [typed, setTyped] = React.useState('');
  const t = when(snapshot);
  const name = snapshot.metadata?.name ?? '';
  const run = () => {
    onStart();
    onClose();
    restoreSnapshot(ns, vm, name, running)
      .then(() => onDone())
      .catch((e: unknown) => onDone(errorMessage(e)));
  };
  return (
    <ContentModal
      variant="small"
      title={`Restore ${name}?`}
      titleIconVariant="warning"
      onClose={onClose}
      dataTestId="ceamls-snapshot-restore"
      contents={
        <Form
          onSubmit={(e) => {
            e.preventDefault();
            if (typed === vm) {
              run();
            }
          }}
        >
          <Content component="p">
            The disk goes back to {t ? <Timestamp date={new Date(t)} /> : 'the snapshot'}.
            Everything written since then is lost.{' '}
            {running
              ? 'The machine stops for the restore, and starts again when it is done. About two minutes.'
              : 'The machine stays stopped. About a minute.'}
          </Content>
          <FormGroup label="Type the machine's name to continue" fieldId="ceamls-restore-confirm">
            <TextInput
              id="ceamls-restore-confirm"
              value={typed}
              onChange={(_e, v) => setTyped(v)}
              placeholder={vm}
              aria-label="The machine's name"
            />
          </FormGroup>
        </Form>
      }
      buttonActions={[
        {
          label: 'Restore',
          onClick: run,
          variant: 'danger',
          isDisabled: typed !== vm,
          dataTestId: 'ceamls-snapshot-restore-confirm',
        },
        { label: 'Cancel', onClick: onClose, variant: 'link' },
      ]}
    />
  );
};

type Props = {
  ns: string;
  vm: string;
  running: boolean;
  /** The page is told while a restore runs, so it can show "Restoring". */
  onRestoring: (restoring: boolean) => void;
};

const SnapshotsCard: React.FC<Props> = ({ ns, vm, running, onRestoring }) => {
  const [snapshots, loaded, loadError] = useSnapshots(ns, vm);
  const [take, setTake] = React.useState(false);
  const [toRestore, setToRestore] = React.useState<VirtualMachineSnapshotKind | undefined>(
    undefined,
  );
  const [toDelete, setToDelete] = React.useState<VirtualMachineSnapshotKind | undefined>(undefined);
  const [restoring, setRestoring] = React.useState(false);
  const [note, setNote] = React.useState<{ ok: boolean; text: string } | undefined>(undefined);
  const names = snapshots.map((s) => s.metadata?.name ?? '');
  const full = snapshots.length >= SNAPSHOT_CAP;
  const anyBusy = snapshots.some((s) => snapshotState(s).tone === 'wait');

  const startRestore = () => {
    setRestoring(true);
    setNote(undefined);
    onRestoring(true);
  };
  const endRestore = (error?: string) => {
    setRestoring(false);
    onRestoring(false);
    setNote(
      error
        ? { ok: false, text: error }
        : {
            ok: true,
            text: running
              ? 'The disk is restored and the machine is starting.'
              : 'The disk is restored.',
          },
    );
  };

  return (
    <Card>
      <CardHeader
        actions={{
          actions: (
            <Button
              variant="primary"
              onClick={() => setTake(true)}
              isDisabled={full || restoring || !loaded}
              data-testid="ceamls-snapshot-new"
            >
              Take snapshot
            </Button>
          ),
          hasNoOffset: true,
        }}
      >
        <CardTitle>
          Snapshots
          <Content component="small" className="pf-v6-u-ml-sm pf-v6-u-font-weight-normal">
            {loaded ? `${snapshots.length} of ${SNAPSHOT_CAP}` : ''}
          </Content>
        </CardTitle>
      </CardHeader>
      <CardBody>
        {note && (
          <Alert
            variant={note.ok ? 'success' : 'danger'}
            isInline
            title={note.ok ? note.text : 'The restore failed'}
            className="pf-v6-u-mb-md"
            actionClose={undefined}
          >
            {note.ok ? null : note.text}
          </Alert>
        )}
        {restoring && (
          <Alert variant="info" isInline title="Restoring" className="pf-v6-u-mb-md">
            {running
              ? 'The machine stops, the disk goes back to the snapshot, and the machine starts again. Stay on this page.'
              : 'The disk goes back to the snapshot. Stay on this page.'}
          </Alert>
        )}
        {loadError ? (
          <Alert variant="warning" isInline isPlain title={errorMessage(loadError)} />
        ) : !loaded ? (
          <Content component="small">Loading…</Content>
        ) : snapshots.length === 0 ? (
          <Content component="p">
            No snapshots. Take one before a risky change: an upgrade, a new driver, a script that
            edits the system. Restore puts the disk back in about two minutes.
          </Content>
        ) : (
          <Table variant="compact" aria-label="Snapshots" data-testid="ceamls-snapshots-table">
            <Thead>
              <Tr>
                <Th>Name</Th>
                <Th>Taken</Th>
                <Th>State</Th>
                <Th>Note</Th>
                <Th screenReaderText="Actions" />
              </Tr>
            </Thead>
            <Tbody>
              {snapshots.map((s) => {
                const st = snapshotState(s);
                const t = when(s);
                return (
                  <Tr key={s.metadata?.uid ?? s.metadata?.name}>
                    <Td dataLabel="Name">{s.metadata?.name}</Td>
                    <Td dataLabel="Taken">{t ? <Timestamp date={new Date(t)} /> : '—'}</Td>
                    <Td dataLabel="State">
                      <VmStateLabel
                        state={{ word: st.word, tone: st.tone, busy: st.tone === 'wait' }}
                      />
                      {st.detail ? <Content component="small">{st.detail}</Content> : null}
                    </Td>
                    <Td dataLabel="Note">{s.metadata?.annotations?.[SNAPSHOT_NOTE] ?? ''}</Td>
                    <Td isActionCell>
                      <Button
                        variant="link"
                        isInline
                        onClick={() => setToRestore(s)}
                        isDisabled={st.tone !== 'ok' || restoring || anyBusy}
                        data-testid="ceamls-snapshot-restore-button"
                      >
                        Restore
                      </Button>
                      <Button
                        variant="link"
                        isInline
                        isDanger
                        className="pf-v6-u-ml-md"
                        onClick={() => setToDelete(s)}
                        isDisabled={restoring || st.tone === 'wait'}
                        data-testid="ceamls-snapshot-delete-button"
                      >
                        Delete
                      </Button>
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        )}
        {full && (
          <Content component="small" className="pf-v6-u-mt-sm">
            The machine has {SNAPSHOT_CAP} snapshots, the most it can have. Delete one to take
            another.
          </Content>
        )}
      </CardBody>
      {take && <TakeModal ns={ns} vm={vm} taken={names} onClose={() => setTake(false)} />}
      {toRestore && (
        <RestoreModal
          ns={ns}
          vm={vm}
          snapshot={toRestore}
          running={running}
          onStart={startRestore}
          onDone={endRestore}
          onClose={() => setToRestore(undefined)}
        />
      )}
      {toDelete && (
        <ConfirmDeleteModal
          title="Delete snapshot?"
          body={
            <>
              This deletes the snapshot <strong>{toDelete.metadata?.name}</strong>. The
              machine&apos;s disk is not changed.
            </>
          }
          confirmLabel="Delete"
          onConfirm={() => deleteSnapshot(ns, toDelete.metadata?.name ?? '')}
          onClose={() => setToDelete(undefined)}
        />
      )}
    </Card>
  );
};

export default SnapshotsCard;
