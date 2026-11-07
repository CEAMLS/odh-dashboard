// CEAMLS: the Create bucket dialog.
import * as React from 'react';
import {
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  TextInput,
} from '@patternfly/react-core';
import { ContentModal } from '@odh-dashboard/ui-core';
import { createBucket, toApiError } from './api';
import type { ApiError } from './api';

// The S3 bucket name rules. The name is one flat space on the whole object
// store, so the API answers 409 when the name is taken.
const NAME_RE = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

type Props = { ns: string; onCreated: () => void; onClose: () => void };

export const CreateBucketModal: React.FC<Props> = ({ ns, onCreated, onClose }) => {
  const [name, setName] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<ApiError | undefined>(undefined);
  let problem: string | undefined;
  if (name && !NAME_RE.test(name)) {
    problem = '3 to 63 characters: lowercase letters, digits, dots and dashes.';
  }
  const ready = !!name && !problem && !busy;
  const submit = () => {
    if (!ready) {
      return;
    }
    setBusy(true);
    setError(undefined);
    createBucket(ns, name)
      .then(() => {
        onClose();
        onCreated();
      })
      .catch((e: unknown) => {
        setError(toApiError(e));
        setBusy(false);
      });
  };
  return (
    <ContentModal
      variant="small"
      title="Create bucket"
      description="A bucket name is unique on the whole object store. If a name is taken, pick another."
      onClose={onClose}
      dataTestId="ceamls-create-bucket"
      error={error}
      alertTitle="The bucket was not created"
      buttonActions={[
        {
          label: 'Create',
          onClick: submit,
          variant: 'primary',
          isLoading: busy,
          isDisabled: !ready,
        },
        { label: 'Cancel', onClick: onClose, variant: 'link', isDisabled: busy },
      ]}
      contents={
        <Form
          id="ceamls-create-bucket-form"
          onSubmit={(ev) => {
            ev.preventDefault();
            submit();
          }}
        >
          <FormGroup label="Name" isRequired fieldId="ceamls-bucket-name">
            <TextInput
              id="ceamls-bucket-name"
              value={name}
              onChange={(_e, v) => setName(v.trim().toLowerCase())}
              validated={problem ? 'error' : 'default'}
              autoFocus
              isRequired
              aria-describedby="ceamls-bucket-name-help"
            />
            <FormHelperText>
              <HelperText id="ceamls-bucket-name-help">
                <HelperTextItem variant={problem ? 'error' : 'default'}>
                  {problem ?? `Example: ${ns}-datasets`}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>
        </Form>
      }
    />
  );
};
