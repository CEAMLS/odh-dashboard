// CEAMLS: shared pieces of the Buckets pages: the fetch hook, the loading
// and error states, and the small confirm dialog.
import * as React from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  Bullseye,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  Spinner,
} from '@patternfly/react-core';
import { CubesIcon, ExclamationCircleIcon, LockIcon } from '@patternfly/react-icons';
import { ContentModal } from '@odh-dashboard/ui-core';
import { bucketsRootPath } from '#~/pages/ceamls/routes';
import { ApiError, toApiError } from './api';

/** Fetch once per change of `deps`; `reload` fetches again without a spinner. */
export const useApi = <T,>(
  fn: () => Promise<T>,
  deps: unknown[],
): { data: T | undefined; error: ApiError | undefined; loading: boolean; reload: () => void } => {
  const [data, setData] = React.useState<T | undefined>(undefined);
  const [error, setError] = React.useState<ApiError | undefined>(undefined);
  const [loading, setLoading] = React.useState(true);
  const [tick, setTick] = React.useState(0);
  const fnRef = React.useRef(fn);
  fnRef.current = fn;
  React.useEffect(() => {
    let live = true;
    fnRef
      .current()
      .then((d) => {
        if (live) {
          setData(d);
          setError(undefined);
        }
      })
      .catch((e: unknown) => {
        if (live) {
          setError(toApiError(e));
        }
      })
      .finally(() => {
        if (live) {
          setLoading(false);
        }
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = React.useCallback(() => setTick((n) => n + 1), []);
  return { data, error, loading, reload };
};

export const Loading: React.FC = () => (
  <Bullseye className="pf-v6-u-p-xl">
    <Spinner aria-label="Loading" />
  </Bullseye>
);

/** The project has no object storage, or the person is not on it. */
export const ApiErrorState: React.FC<{ error: ApiError; ns?: string }> = ({ error, ns }) => {
  if (error.status === 404 && ns) {
    return (
      <EmptyState headingLevel="h2" icon={CubesIcon} titleText="No object storage in this project">
        <EmptyStateBody>
          Object storage is part of the project quota. A cluster admin raises the quota in CEAMLS
          Cluster Admin. The project then gets an S3 user, a first bucket and the connection
          &quot;Project S3 storage&quot; on the Connections tab.
        </EmptyStateBody>
      </EmptyState>
    );
  }
  if (error.status === 403) {
    return (
      <EmptyState headingLevel="h2" icon={LockIcon} titleText="Not a member of this project">
        <EmptyStateBody>
          Only the PI and the members of a project can see its buckets and keys.
        </EmptyStateBody>
        <EmptyStateFooter>
          <EmptyStateActions>
            <Link to={bucketsRootPath}>Show my projects</Link>
          </EmptyStateActions>
        </EmptyStateFooter>
      </EmptyState>
    );
  }
  return (
    <EmptyState
      headingLevel="h2"
      icon={ExclamationCircleIcon}
      status="danger"
      titleText="The storage API did not answer"
    >
      <EmptyStateBody>{error.message}</EmptyStateBody>
    </EmptyState>
  );
};

export const InlineError: React.FC<{ error: ApiError | string | undefined; title?: string }> = ({
  error,
  title,
}) => {
  if (!error) {
    return null;
  }
  return (
    <Alert
      variant="danger"
      isInline
      title={title ?? 'The request failed'}
      className="pf-v6-u-mb-md"
    >
      {typeof error === 'string' ? error : error.message}
    </Alert>
  );
};

type ConfirmProps = {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => Promise<unknown>;
  onDone?: () => void;
  onClose: () => void;
};

/** A small danger dialog: title, text, Delete / Cancel. */
export const ConfirmDeleteModal: React.FC<ConfirmProps> = ({
  title,
  body,
  confirmLabel,
  onConfirm,
  onDone,
  onClose,
}) => {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<ApiError | undefined>(undefined);
  const run = () => {
    setBusy(true);
    setError(undefined);
    onConfirm()
      .then(() => {
        onClose();
        onDone?.();
      })
      .catch((e: unknown) => {
        setError(toApiError(e));
        setBusy(false);
      });
  };
  return (
    <ContentModal
      variant="small"
      title={title}
      titleIconVariant="warning"
      onClose={onClose}
      dataTestId="ceamls-confirm-delete"
      contents={body}
      error={error}
      alertTitle="The request failed"
      buttonActions={[
        { label: confirmLabel, onClick: run, variant: 'danger', isLoading: busy, isDisabled: busy },
        { label: 'Cancel', onClick: onClose, variant: 'link', isDisabled: busy },
      ]}
    />
  );
};
