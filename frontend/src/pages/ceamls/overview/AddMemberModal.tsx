// CEAMLS: the Add Member dialog of the project Overview tab. First a
// search among the people who have an account: Add puts the person on
// the project at once. A person with no account gets a request form;
// an admin answers the request in CEAMLS Cluster Admin.
import * as React from 'react';
import {
  Alert,
  Button,
  Content,
  Form,
  FormGroup,
  FormSelect,
  FormSelectOption,
  Grid,
  GridItem,
  SearchInput,
  Spinner,
  TextArea,
  TextInput,
} from '@patternfly/react-core';
import { ContentModal } from '@odh-dashboard/ui-core';
import { toApiError } from '#~/pages/ceamls/buckets/api';
import { STANDINGS, changeMembers, requestAccess, searchCandidates } from './api';
import type { Candidate } from './api';

type Props = {
  ns: string;
  title: string;
  /** Called after a change, so that the People list reads again. */
  onChanged: () => void;
  onClose: () => void;
};

const standingLabel = (s: string): string =>
  STANDINGS.find((x) => x.value === `ceamls-${s}` || x.value === s)?.label ?? '';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const AddMemberModal: React.FC<Props> = ({ ns, title, onChanged, onClose }) => {
  const [step, setStep] = React.useState<'search' | 'request' | 'sent'>('search');
  const [query, setQuery] = React.useState('');
  const [found, setFound] = React.useState<{ people: Candidate[]; more: boolean }>();
  const [searching, setSearching] = React.useState(false);
  const [adding, setAdding] = React.useState<string>();
  const [added, setAdded] = React.useState<string[]>([]);
  const [error, setError] = React.useState<Error>();
  const [form, setForm] = React.useState({
    firstName: '',
    lastName: '',
    email: '',
    standing: STANDINGS[0].value,
    reason: '',
  });
  const [busy, setBusy] = React.useState(false);
  // The dialog takes the focus when it opens, so the search box asks for
  // it a moment later.
  const searchRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (step !== 'search') {
      return undefined;
    }
    const id = setTimeout(() => searchRef.current?.focus(), 100);
    return () => clearTimeout(id);
  }, [step]);

  // The search runs a short time after the last key.
  const q = query.trim();
  React.useEffect(() => {
    if (q.length < 2) {
      setFound(undefined);
      setSearching(false);
      return undefined;
    }
    let live = true;
    setSearching(true);
    const id = setTimeout(() => {
      searchCandidates(ns, q)
        .then((out) => {
          if (live) {
            setFound(out);
            setError(undefined);
          }
        })
        .catch((e: unknown) => live && setError(toApiError(e)))
        .finally(() => live && setSearching(false));
    }, 250);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [ns, q]);

  const add = (person: Candidate) => {
    setAdding(person.email);
    setError(undefined);
    changeMembers(ns, { add: [person.email] })
      .then(() => {
        setAdded((list) => [...list, person.email]);
        onChanged();
      })
      .catch((e: unknown) => setError(toApiError(e)))
      .finally(() => setAdding(undefined));
  };

  const ready =
    form.firstName.trim() !== '' &&
    form.lastName.trim() !== '' &&
    EMAIL_RE.test(form.email.trim()) &&
    form.reason.trim() !== '';

  const send = () => {
    if (!ready || busy) {
      return;
    }
    setBusy(true);
    setError(undefined);
    requestAccess(ns, { ...form, email: form.email.trim() })
      .then(() => {
        onChanged();
        setStep('sent');
      })
      .catch((e: unknown) => setError(toApiError(e)))
      .finally(() => setBusy(false));
  };

  if (step === 'sent') {
    return (
      <ContentModal
        variant="small"
        title="The request waits for an admin"
        onClose={onClose}
        dataTestId="ceamls-add-member"
        buttonActions={[{ label: 'Close', onClick: onClose, variant: 'primary' }]}
        contents={
          <Content component="p">
            The CEAMLS team reviews the request for {form.firstName} {form.lastName}. On approval
            the person gets an account and an invitation by email, and joins {title}. The request
            shows in the People list until then.
          </Content>
        }
      />
    );
  }

  if (step === 'request') {
    const set = (key: keyof typeof form) => (_e: unknown, v: string) =>
      setForm((f) => ({ ...f, [key]: v }));
    return (
      <ContentModal
        variant="small"
        title="Request access for a new person"
        description={`An admin reviews the request. On approval the person gets an account and joins ${title}.`}
        onClose={onClose}
        dataTestId="ceamls-add-member"
        error={error}
        alertTitle="The request was not sent"
        buttonActions={[
          {
            label: 'Send request',
            onClick: send,
            variant: 'primary',
            isLoading: busy,
            isDisabled: !ready,
          },
          {
            label: 'Back',
            onClick: () => {
              setError(undefined);
              setStep('search');
            },
            variant: 'link',
            isDisabled: busy,
          },
        ]}
        contents={
          <Form
            id="ceamls-request-access-form"
            onSubmit={(ev) => {
              ev.preventDefault();
              send();
            }}
          >
            <Grid hasGutter>
              <GridItem sm={6}>
                <FormGroup label="First name" isRequired fieldId="ceamls-req-first">
                  <TextInput
                    id="ceamls-req-first"
                    value={form.firstName}
                    onChange={set('firstName')}
                    isRequired
                    autoFocus
                  />
                </FormGroup>
              </GridItem>
              <GridItem sm={6}>
                <FormGroup label="Last name" isRequired fieldId="ceamls-req-last">
                  <TextInput
                    id="ceamls-req-last"
                    value={form.lastName}
                    onChange={set('lastName')}
                    isRequired
                  />
                </FormGroup>
              </GridItem>
            </Grid>
            <FormGroup label="Morgan email" isRequired fieldId="ceamls-req-email">
              <TextInput
                id="ceamls-req-email"
                type="email"
                value={form.email}
                onChange={set('email')}
                isRequired
              />
            </FormGroup>
            <FormGroup label="Standing" isRequired fieldId="ceamls-req-standing">
              <FormSelect id="ceamls-req-standing" value={form.standing} onChange={set('standing')}>
                {STANDINGS.map((s) => (
                  <FormSelectOption key={s.value} value={s.value} label={s.label} />
                ))}
              </FormSelect>
            </FormGroup>
            <FormGroup
              label="What the person will do in the project"
              isRequired
              fieldId="ceamls-req-reason"
            >
              <TextArea
                id="ceamls-req-reason"
                value={form.reason}
                onChange={set('reason')}
                rows={3}
                resizeOrientation="vertical"
                isRequired
              />
            </FormGroup>
          </Form>
        }
      />
    );
  }

  return (
    <ContentModal
      variant="small"
      title={`Add a member to ${title}`}
      onClose={onClose}
      dataTestId="ceamls-add-member"
      error={error}
      alertTitle="The request failed"
      buttonActions={[
        { label: 'Close', onClick: onClose, variant: 'primary' },
        {
          label: 'The person has no account',
          onClick: () => {
            setError(undefined);
            if (EMAIL_RE.test(q)) {
              setForm((f) => ({ ...f, email: q }));
            }
            setStep('request');
          },
          variant: 'link',
          dataTestId: 'ceamls-no-account',
        },
      ]}
      contents={
        <>
          <SearchInput
            aria-label="Name or email"
            placeholder="Name or email"
            value={query}
            onChange={(_e, v) => setQuery(v)}
            onClear={() => setQuery('')}
            ref={searchRef}
            data-testid="ceamls-member-search"
          />
          <div style={{ minHeight: 120 }} aria-live="polite" className="pf-v6-u-mt-md">
            {q.length < 2 ? (
              <Content component="small">Type two letters or more of a name or an email.</Content>
            ) : !found ? (
              searching && <Spinner size="md" aria-label="Searching" />
            ) : found.people.length === 0 ? (
              <Content component="p">
                Nobody with an account matches “{q}”. If the person is new to CEAMLS Cloud, select
                “The person has no account”.
              </Content>
            ) : (
              <>
                {found.people.map((p) => {
                  const here = p.onProject || added.includes(p.email);
                  return (
                    <div className="ceamls-person" key={p.email}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{p.name}</div>
                        <Content component="small">
                          {[p.email, standingLabel(p.standing)].filter(Boolean).join(', ')}
                        </Content>
                      </div>
                      <div>
                        {here ? (
                          <Content component="small">
                            {p.onProject ? 'Already in the project' : 'Added'}
                          </Content>
                        ) : (
                          <Button
                            variant="secondary"
                            onClick={() => add(p)}
                            isLoading={adding === p.email}
                            isDisabled={adding !== undefined}
                            aria-label={`Add ${p.name}`}
                          >
                            Add
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {found.more && (
                  <Content component="small">More people match. Type more of the name.</Content>
                )}
              </>
            )}
          </div>
          {added.length > 0 && (
            <Alert
              variant="success"
              isInline
              isPlain
              title="The person gets access within a minute, as a member."
              className="pf-v6-u-mt-md"
            />
          )}
        </>
      }
    />
  );
};

export default AddMemberModal;
