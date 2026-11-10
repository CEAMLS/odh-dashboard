// CEAMLS: the People block of the project Overview tab. Every member
// reads the list. The PI and the admins also get Add Member, Remove and
// the access requests; the API makes the same check.
import * as React from 'react';
import { Alert, Button, Card, CardBody, Content } from '@patternfly/react-core';
import { ContentModal } from '@odh-dashboard/ui-core';
import { toApiError } from '#~/pages/ceamls/buckets/api';
import { cancelRequest, changeMembers } from './api';
import type { AccessRequest, Person, ProjectPage } from './api';
import AddMemberModal from './AddMemberModal';
import CardHead from './CardHead';

const WARN = 'var(--pf-t--global--text--color--status--warning--default)';
const DANGER = 'var(--pf-t--global--text--color--status--danger--default)';

/** A status as a dot and a word. */
const DotWord: React.FC<{ color: string; children: React.ReactNode }> = ({ color, children }) => (
  <span style={{ color, fontWeight: 600, whiteSpace: 'nowrap' }}>
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: 4,
        background: 'currentColor',
        marginRight: 6,
      }}
    />
    {children}
  </span>
);

const RemoveModal: React.FC<{
  ns: string;
  person: Person;
  onDone: () => void;
  onClose: () => void;
}> = ({ ns, person, onDone, onClose }) => {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<Error>();
  const run = () => {
    setBusy(true);
    setError(undefined);
    changeMembers(ns, { remove: [person.email] })
      .then(() => {
        onDone();
        onClose();
      })
      .catch((e: unknown) => {
        setError(toApiError(e));
        setBusy(false);
      });
  };
  return (
    <ContentModal
      variant="small"
      title={`Remove ${person.name} from the project?`}
      onClose={onClose}
      dataTestId="ceamls-remove-member"
      error={error}
      alertTitle="The person was not removed"
      buttonActions={[
        { label: 'Remove', onClick: run, variant: 'danger', isLoading: busy },
        { label: 'Cancel', onClick: onClose, variant: 'link', isDisabled: busy },
      ]}
      contents={
        <Content component="p">
          The person loses access to the project within a minute. The work the person started stays
          in the project. The account of the person stays too.
        </Content>
      }
    />
  );
};

const RequestRow: React.FC<{ ns: string; request: AccessRequest; onDone: () => void }> = ({
  ns,
  request,
  onDone,
}) => {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const denied = request.status === 'denied';
  const drop = () => {
    setBusy(true);
    setError(undefined);
    cancelRequest(ns, request.id)
      .then(onDone)
      .catch((e: unknown) => {
        setError(toApiError(e).message);
        setBusy(false);
      });
  };
  return (
    <div className="ceamls-person" data-testid="ceamls-request-row">
      <div>
        <div style={{ fontWeight: 600 }}>
          {request.firstName} {request.lastName}
        </div>
        <Content component="small">{request.email}</Content>
        {denied && request.denyReason && (
          <Content component="small">Reason: {request.denyReason}</Content>
        )}
        {error && <Content component="small">{error}</Content>}
      </div>
      <div>
        {denied ? (
          <DotWord color={DANGER}>Denied</DotWord>
        ) : (
          <DotWord color={WARN}>Waits for an admin</DotWord>
        )}
        <br />
        <Button variant="link" isInline onClick={drop} isLoading={busy} isDisabled={busy}>
          {denied ? 'Remove from the list' : 'Cancel request'}
        </Button>
      </div>
    </div>
  );
};

const PeopleCard: React.FC<{ ns: string; page: ProjectPage; reload: () => void }> = ({
  ns,
  page,
  reload,
}) => {
  const [adding, setAdding] = React.useState(false);
  const [removing, setRemoving] = React.useState<Person>();
  return (
    <Card isFullHeight data-testid="ceamls-overview-people">
      <CardHead title="People">
        {page.canManage && (
          <Button
            variant="primary"
            onClick={() => setAdding(true)}
            isDisabled={page.status === 'retired'}
            data-testid="ceamls-add-member-button"
          >
            Add Member
          </Button>
        )}
      </CardHead>
      <CardBody>
        {!page.keycloak && (
          <Alert
            variant="info"
            isInline
            isPlain
            title="The names cannot be read now. The list shows the emails."
            className="pf-v6-u-mb-sm"
          />
        )}
        {page.people.map((p) => (
          <div className="ceamls-person" key={p.email} data-testid="ceamls-person-row">
            <div>
              <div style={{ fontWeight: 600 }}>
                {p.name}
                {p.email === page.you && <span style={{ fontWeight: 400 }}> (you)</span>}
              </div>
              {p.name !== p.email && <Content component="small">{p.email}</Content>}
            </div>
            <div>
              {p.role === 'pi' ? 'PI' : 'Member'}
              {page.canManage && p.role === 'member' && (
                <>
                  <br />
                  <Button
                    variant="link"
                    isInline
                    onClick={() => setRemoving(p)}
                    aria-label={`Remove ${p.name}`}
                  >
                    Remove
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}
        {page.requests.map((r) => (
          <RequestRow key={r.id} ns={ns} request={r} onDone={reload} />
        ))}
        {page.people.length === 0 && <Content component="p">The project has no people.</Content>}
      </CardBody>
      {adding && (
        <AddMemberModal
          ns={ns}
          title={page.title || ns}
          onChanged={reload}
          onClose={() => setAdding(false)}
        />
      )}
      {removing && (
        <RemoveModal
          ns={ns}
          person={removing}
          onDone={reload}
          onClose={() => setRemoving(undefined)}
        />
      )}
    </Card>
  );
};

export default PeopleCard;
