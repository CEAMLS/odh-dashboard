// CEAMLS: the Quotas block of the project Overview tab: one bar per
// resource, "used of quota". The quota is the bold value.
import * as React from 'react';
import {
  Alert,
  Card,
  CardBody,
  CardTitle,
  Content,
  Progress,
  ProgressMeasureLocation,
  ProgressSize,
  ProgressVariant,
  Skeleton,
} from '@patternfly/react-core';
import type { QuotaRow } from './logic';
import type { QuotaState } from './data';

const NOTE: Partial<Record<QuotaRow['state'], string>> = {
  almost: 'Almost full',
  full: 'Full',
};

const TONE: Partial<Record<QuotaRow['state'], string>> = {
  almost: 'var(--pf-t--global--text--color--status--warning--default)',
  full: 'var(--pf-t--global--text--color--status--danger--default)',
};

const RowText: React.FC<{ row: QuotaRow }> = ({ row }) => {
  if (row.state === 'none') {
    return <Content component="small">Not granted</Content>;
  }
  const note = NOTE[row.state];
  return (
    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
      {row.usedText} of <b>{row.totalText}</b>{' '}
      {note ? (
        <span style={{ color: TONE[row.state], fontWeight: 600 }}>{note}</span>
      ) : (
        <Content component="small" style={{ display: 'inline' }}>
          ({row.freeText})
        </Content>
      )}
    </span>
  );
};

const QuotasCard: React.FC<{ quota: QuotaState }> = ({ quota }) => (
  <Card isFullHeight data-testid="ceamls-overview-quotas">
    <CardTitle component="h2">Quotas</CardTitle>
    <CardBody>
      {quota.error ? (
        <Alert variant="warning" isInline isPlain title="The quota cannot be read now" />
      ) : !quota.loaded ? (
        <Skeleton height="180px" screenreaderText="Loading the quota" />
      ) : (
        <div className="ceamls-quota-rows">
          {quota.rows.map((row) => (
            <div className="ceamls-quota-row" key={row.key} data-testid={`ceamls-quota-${row.key}`}>
              <div style={{ fontWeight: 600 }} id={`ceamls-quota-label-${row.key}`}>
                {row.label}
              </div>
              <Progress
                value={row.percent}
                aria-labelledby={`ceamls-quota-label-${row.key}`}
                measureLocation={ProgressMeasureLocation.none}
                size={ProgressSize.sm}
                variant={
                  row.state === 'full'
                    ? ProgressVariant.danger
                    : row.state === 'almost'
                    ? ProgressVariant.warning
                    : undefined
                }
              />
              <div>
                <RowText row={row} />
              </div>
            </div>
          ))}
        </div>
      )}
    </CardBody>
  </Card>
);

export default QuotasCard;
