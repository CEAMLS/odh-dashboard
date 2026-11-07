// CEAMLS: delete a bucket with everything in it.
import * as React from 'react';
import {
  Form,
  FormGroup,
  Progress,
  ProgressMeasureLocation,
  TextInput,
} from '@patternfly/react-core';
import { ContentModal } from '@odh-dashboard/ui-core';
import { bucketUsage, purgeBucket, toApiError } from './api';
import type { ApiError, Usage } from './api';
import { formatBytes } from './format';

type Props = { ns: string; bucket: string; onDone?: () => void; onClose: () => void };

// Purge calls that delete nothing in a row before the dialog gives up.
const STALL_LIMIT = 10;

const describe = (bucket: string, usage: Usage | undefined): string => {
  if (!usage) {
    return `Counting the objects in ${bucket}…`;
  }
  if (usage.objects === 0) {
    return `The empty bucket ${bucket} is deleted.`;
  }
  if (usage.complete) {
    return `The bucket ${bucket} and its ${usage.objects.toLocaleString()} objects (${formatBytes(
      usage.bytes,
    )}) are deleted. This cannot be undone.`;
  }
  return `The bucket ${bucket} and more than ${usage.objects.toLocaleString()} objects are deleted. This cannot be undone.`;
};

const purgeAll = async (
  ns: string,
  bucket: string,
  stopped: React.MutableRefObject<boolean>,
  onCount: (n: number) => void,
): Promise<boolean> => {
  let count = 0;
  let stalls = 0;
  for (;;) {
    if (stopped.current) {
      return false;
    }
    // eslint-disable-next-line no-await-in-loop
    const step = await purgeBucket(ns, bucket);
    count += step.deleted;
    onCount(count);
    if (step.done) {
      return true;
    }
    stalls = step.deleted ? 0 : stalls + 1;
    if (stalls >= STALL_LIMIT) {
      throw new Error('The store still reports objects in the bucket. Try again in a minute.');
    }
  }
};

/** The person types the bucket name to confirm. The objects go in batches,
 * with progress, and the bucket itself goes last, so a stop halfway leaves
 * a smaller bucket. */
export const DeleteBucketModal: React.FC<Props> = ({ ns, bucket, onDone, onClose }) => {
  const [usage, setUsage] = React.useState<Usage | undefined>(undefined);
  const [typed, setTyped] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [deleted, setDeleted] = React.useState(0);
  const [error, setError] = React.useState<ApiError | undefined>(undefined);
  const stopped = React.useRef(false);

  React.useEffect(() => {
    let live = true;
    bucketUsage(ns, bucket)
      .then((u) => {
        if (live) {
          setUsage(u);
        }
      })
      .catch((e: unknown) => {
        if (live) {
          setError(toApiError(e));
        }
      });
    return () => {
      live = false;
    };
  }, [ns, bucket]);

  const total = usage?.objects ?? 0;
  const ready = typed === bucket && !!usage && !busy;
  const run = () => {
    if (!ready) {
      return;
    }
    setBusy(true);
    setError(undefined);
    purgeAll(ns, bucket, stopped, setDeleted)
      .then((finished) => {
        if (finished) {
          onClose();
          onDone?.();
        }
      })
      .catch((e: unknown) => {
        setError(toApiError(e));
        setBusy(false);
      });
  };
  const close = () => {
    stopped.current = true;
    onClose();
  };
  let progressLabel = `${deleted.toLocaleString()} deleted`;
  if (usage?.complete) {
    progressLabel = `${deleted.toLocaleString()} of ${total.toLocaleString()}`;
  }
  return (
    <ContentModal
      variant="small"
      title="Delete bucket?"
      titleIconVariant="warning"
      onClose={close}
      dataTestId="ceamls-delete-bucket"
      error={error}
      alertTitle="The bucket was not deleted"
      buttonActions={[
        { label: 'Delete', onClick: run, variant: 'danger', isLoading: busy, isDisabled: !ready },
        { label: busy ? 'Stop' : 'Cancel', onClick: close, variant: 'link' },
      ]}
      contents={
        <>
          <p>{describe(bucket, usage)}</p>
          {busy ? (
            <Progress
              className="pf-v6-u-mt-md"
              title="Deleting objects"
              value={total ? Math.min(100, Math.round((deleted / total) * 100)) : 0}
              label={progressLabel}
              measureLocation={ProgressMeasureLocation.outside}
            />
          ) : (
            <Form
              id="ceamls-delete-bucket-form"
              className="pf-v6-u-mt-md"
              onSubmit={(ev) => {
                ev.preventDefault();
                run();
              }}
            >
              <FormGroup
                label={`Type ${bucket} to confirm`}
                isRequired
                fieldId="ceamls-delete-bucket-name"
              >
                <TextInput
                  id="ceamls-delete-bucket-name"
                  value={typed}
                  onChange={(_e, v) => setTyped(v.trim())}
                  autoFocus
                  isRequired
                />
              </FormGroup>
            </Form>
          )}
        </>
      }
    />
  );
};
