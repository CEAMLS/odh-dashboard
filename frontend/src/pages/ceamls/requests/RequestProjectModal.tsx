// CEAMLS: the Request a project dialog. The person names the project,
// says what it is for, names the PI and can ask for resources. An admin
// turns the request into a project in CEAMLS Cluster Admin (the New
// project form opens filled in from it) or denies it with a reason.
import * as React from 'react';
import {
  Content,
  Form,
  FormGroup,
  FormHelperText,
  Grid,
  GridItem,
  HelperText,
  HelperTextItem,
  TextArea,
  TextInput,
} from '@patternfly/react-core';
import { ContentModal } from '@odh-dashboard/ui-core';
import { toApiError } from '#~/pages/ceamls/buckets/api';
import { NAME_RE, requestProject, slugOf } from './api';
import type { MyRequests, NewProjectRequest } from './api';

type Props = {
  me?: MyRequests;
  onSent: () => void;
  onClose: () => void;
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const today = (): string => new Date().toISOString().slice(0, 10);

const RESOURCES: { key: keyof NewProjectRequest['quota']; label: string }[] = [
  { key: 'gpu', label: 'GPU units' },
  { key: 'cpu', label: 'CPU cores' },
  { key: 'memory', label: 'Memory (GiB)' },
  { key: 'storage', label: 'Storage (GiB)' },
];

const RequestProjectModal: React.FC<Props> = ({ me, onSent, onClose }) => {
  const [form, setForm] = React.useState<NewProjectRequest>({
    title: '',
    name: '',
    description: '',
    pi: me?.you ?? '',
    endDate: '',
    quota: { gpu: '', cpu: '', memory: '', storage: '' },
  });
  // The short name follows the title until the person edits it.
  const [nameEdited, setNameEdited] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<Error>();
  const [sent, setSent] = React.useState(false);

  const set =
    (key: 'title' | 'name' | 'description' | 'pi' | 'endDate') => (_e: unknown, v: string) =>
      setForm((f) => {
        const next = { ...f, [key]: v };
        if (key === 'title' && !nameEdited) {
          next.name = slugOf(v);
        }
        return next;
      });
  const setQuota = (key: keyof NewProjectRequest['quota']) => (_e: unknown, v: string) =>
    setForm((f) => ({ ...f, quota: { ...f.quota, [key]: v.replace(/[^0-9]/g, '') } }));

  const title = form.title.trim();
  const nameOk = NAME_RE.test(form.name) && !/^(openshift-|kube-|ceamls-)/.test(form.name);
  const endOk = form.endDate === '' || form.endDate > today();
  const ready =
    title.length >= 3 &&
    nameOk &&
    form.description.trim() !== '' &&
    EMAIL_RE.test(form.pi.trim()) &&
    endOk;

  const send = () => {
    if (!ready || busy) {
      return;
    }
    setBusy(true);
    setError(undefined);
    requestProject({ ...form, title, pi: form.pi.trim().toLowerCase() })
      .then(() => {
        onSent();
        setSent(true);
      })
      .catch((e: unknown) => setError(toApiError(e)))
      .finally(() => setBusy(false));
  };

  if (sent) {
    return (
      <ContentModal
        variant="small"
        title="The request waits for an admin"
        onClose={onClose}
        dataTestId="ceamls-request-project"
        buttonActions={[{ label: 'Close', onClick: onClose, variant: 'primary' }]}
        contents={
          <Content component="p">
            The CEAMLS team reviews the request for {title}. When the project exists it appears in
            your project list. Until then the request shows on this page, and so does a reason if
            the request is denied.
          </Content>
        }
      />
    );
  }

  const defaults = me?.defaults;
  return (
    <ContentModal
      variant="medium"
      title="Request a project"
      description="An admin reviews the request and creates the project. You see the answer on this page."
      onClose={onClose}
      dataTestId="ceamls-request-project"
      error={error}
      alertTitle="The request was not sent"
      buttonActions={[
        {
          label: 'Send request',
          onClick: send,
          variant: 'primary',
          isLoading: busy,
          isDisabled: !ready,
          dataTestId: 'ceamls-request-send',
        },
        { label: 'Cancel', onClick: onClose, variant: 'link', isDisabled: busy },
      ]}
      contents={
        <Form
          id="ceamls-request-project-form"
          onSubmit={(ev) => {
            ev.preventDefault();
            send();
          }}
        >
          <FormGroup label="Title" isRequired fieldId="ceamls-rp-title">
            <TextInput
              id="ceamls-rp-title"
              value={form.title}
              onChange={set('title')}
              isRequired
              autoFocus
              maxLength={120}
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem>The name people see in the project list.</HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>
          <FormGroup label="Short name" isRequired fieldId="ceamls-rp-name">
            <TextInput
              id="ceamls-rp-name"
              value={form.name}
              onChange={(e, v) => {
                setNameEdited(true);
                set('name')(e, v.toLowerCase());
              }}
              isRequired
              validated={form.name === '' || nameOk ? 'default' : 'error'}
              maxLength={52}
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem variant={form.name === '' || nameOk ? 'default' : 'error'}>
                  Lower case letters, digits and dashes. It names the namespace and cannot change
                  later.
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>
          <FormGroup label="Project description" isRequired fieldId="ceamls-rp-desc">
            <TextArea
              id="ceamls-rp-desc"
              value={form.description}
              onChange={set('description')}
              rows={3}
              resizeOrientation="vertical"
              isRequired
              maxLength={1000}
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem>
                  A few sentences: focus on the technical requirements and a brief description of
                  the project.
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>
          <Grid hasGutter>
            <GridItem sm={7}>
              <FormGroup label="Principal investigator" isRequired fieldId="ceamls-rp-pi">
                <TextInput
                  id="ceamls-rp-pi"
                  type="email"
                  value={form.pi}
                  onChange={set('pi')}
                  isRequired
                />
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem>
                      The email of the faculty member who answers for the project. Keep your own if
                      that is you.
                    </HelperTextItem>
                  </HelperText>
                </FormHelperText>
              </FormGroup>
            </GridItem>
            <GridItem sm={5}>
              <FormGroup label="End date" fieldId="ceamls-rp-end">
                <TextInput
                  id="ceamls-rp-end"
                  type="date"
                  value={form.endDate}
                  onChange={set('endDate')}
                  min={today()}
                  validated={endOk ? 'default' : 'error'}
                />
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem variant={endOk ? 'default' : 'error'}>
                      {endOk ? 'Empty means no end date.' : 'The end date is in the past.'}
                    </HelperTextItem>
                  </HelperText>
                </FormHelperText>
              </FormGroup>
            </GridItem>
          </Grid>
          <FormGroup
            label="Resources"
            fieldId="ceamls-rp-gpu"
            role="group"
            className="ceamls-rp-resources"
          >
            <Grid hasGutter>
              {RESOURCES.map((r) => (
                <GridItem sm={4} md={2} key={r.key}>
                  <TextInput
                    id={`ceamls-rp-${r.key}`}
                    aria-label={r.label}
                    inputMode="numeric"
                    value={form.quota[r.key]}
                    onChange={setQuota(r.key)}
                    placeholder={defaults ? String(defaults[r.key]) : ''}
                  />
                  <Content component="small">{r.label}</Content>
                </GridItem>
              ))}
            </Grid>
            <FormHelperText>
              <HelperText>
                <HelperTextItem>
                  Empty means the default. One GPU unit is a quarter of an H100. The admin sets the
                  final numbers.
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>
        </Form>
      }
    />
  );
};

export default RequestProjectModal;
