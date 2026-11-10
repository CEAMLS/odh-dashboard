// CEAMLS: the project Overview tab. The stock tab showed cards for
// workbenches, pipelines and models, which the tabs next to it show
// already. This one shows what no other page shows: the PI and the
// dates, the quota and what holds it, the use over time, and the people.
// The plan is planning/hub_pages.md section 3.7 in the cluster repo.
import * as React from 'react';
import {
  Alert,
  Card,
  CardBody,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Grid,
  GridItem,
  Label,
  Skeleton,
  Stack,
  StackItem,
} from '@patternfly/react-core';
import type { ProjectPage } from './api';
import { useProjectPage, useQuotaRows, useWorkloads } from './data';
import { dateText } from './logic';
import QuotasCard from './QuotasCard';
import PeopleCard from './PeopleCard';
import AllocationCard from './AllocationCard';
import UseOverTimeCard from './UseOverTimeCard';
import './overview.css';

/** The days before the end date from which the page warns. */
const WARN_DAYS = 30;

const Fact: React.FC<{ term: string; children: React.ReactNode }> = ({ term, children }) => (
  <DescriptionListGroup>
    <DescriptionListTerm>{term}</DescriptionListTerm>
    <DescriptionListDescription>{children}</DescriptionListDescription>
  </DescriptionListGroup>
);

const daysWord = (n: number): string => (n === 1 ? '1 day' : `${n} days`);

const Banner: React.FC<{ page: ProjectPage }> = ({ page }) => {
  const end = page.endDate ? dateText(page.endDate) : undefined;
  const kept = page.deleteAfter ? ` The data stays until ${dateText(page.deleteAfter)}.` : '';
  if (page.status === 'retired') {
    return (
      <Alert variant="danger" isInline title="The project is retired">
        Nothing runs, and nobody can start work.{kept} To open the project again, the PI writes to
        the CEAMLS team.
      </Alert>
    );
  }
  if (page.status === 'suspended') {
    return (
      <Alert
        variant="danger"
        isInline
        title={
          end && page.daysLeft !== null && page.daysLeft < 0
            ? `The project ended on ${end}`
            : 'The project is suspended'
        }
      >
        Nothing runs, and nobody can start work.{kept} To open the project again, the PI writes to
        the CEAMLS team.
      </Alert>
    );
  }
  if (end && page.daysLeft !== null && page.daysLeft <= WARN_DAYS) {
    return (
      <Alert
        variant="warning"
        isInline
        title={
          page.daysLeft > 0
            ? `The project ends in ${daysWord(page.daysLeft)}, on ${end}`
            : `The project ends on ${end}`
        }
      >
        On that day access stops for every member. To keep the project, the PI asks the CEAMLS team
        for a new term.
      </Alert>
    );
  }
  return null;
};

const STATUS_WORD: Record<string, string> = { suspended: 'Suspended', retired: 'Retired' };

const Facts: React.FC<{ page: ProjectPage }> = ({ page }) => (
  <Card data-testid="ceamls-overview-facts">
    <CardBody>
      <DescriptionList isAutoFit autoFitMinModifier={{ default: '200px' }} isCompact>
        <Fact term="Principal investigator">
          {page.pi ? (
            <>
              {page.pi.name}
              {page.pi.name !== page.pi.email && (
                <>
                  <br />
                  <a href={`mailto:${page.pi.email}`}>{page.pi.email}</a>
                </>
              )}
            </>
          ) : (
            'Not set'
          )}
        </Fact>
        <Fact term="Started">{page.startDate ? dateText(page.startDate) : 'Not set'}</Fact>
        <Fact term="Ends">
          {page.endDate ? (
            <>
              {dateText(page.endDate)}
              {page.status === 'active' && page.daysLeft !== null && page.daysLeft > 0 && (
                <>
                  <br />
                  {daysWord(page.daysLeft)} left
                </>
              )}
            </>
          ) : (
            'No end date'
          )}
        </Fact>
        <Fact term="People">
          {page.people.length}
          {STATUS_WORD[page.status] && (
            <Label
              status={page.status === 'retired' ? 'danger' : 'warning'}
              variant="outline"
              className="pf-v6-u-ml-md"
              data-testid="ceamls-overview-status"
            >
              {STATUS_WORD[page.status]}
            </Label>
          )}
        </Fact>
      </DescriptionList>
    </CardBody>
  </Card>
);

const SharedFacts: React.FC = () => (
  <Card data-testid="ceamls-overview-facts">
    <CardBody>
      <DescriptionList columnModifier={{ default: '1Col', sm: '3Col' }} isCompact>
        <Fact term="Owner">
          The CEAMLS team <Label variant="outline">Shared</Label>
        </Fact>
        <Fact term="Ends">No end date</Fact>
        <Fact term="Managed in">The cluster repository, not the admin app</Fact>
      </DescriptionList>
    </CardBody>
  </Card>
);

const CeamlsProjectOverview: React.FC<{ ns: string }> = ({ ns }) => {
  const project = useProjectPage(ns);
  const quota = useQuotaRows(ns);
  const work = useWorkloads(ns);
  const { page } = project;
  return (
    <Stack hasGutter>
      {page && <Banner page={page} />}
      {project.error && (
        <StackItem>
          <Alert
            variant="warning"
            isInline
            title="The project facts and the people cannot be read now"
          >
            {project.error.message}
          </Alert>
        </StackItem>
      )}
      <StackItem>
        {!project.loaded ? (
          <Skeleton height="96px" screenreaderText="Loading the project" />
        ) : page ? (
          <Facts page={page} />
        ) : (
          project.shared && <SharedFacts />
        )}
      </StackItem>
      <StackItem>
        <Grid hasGutter>
          <GridItem lg={page ? 7 : 12}>
            <QuotasCard quota={quota} />
          </GridItem>
          {page && (
            <GridItem lg={5}>
              <PeopleCard ns={ns} page={page} reload={project.reload} />
            </GridItem>
          )}
        </Grid>
      </StackItem>
      <StackItem>
        <AllocationCard
          ns={ns}
          loaded={work.loaded}
          rows={work.rows}
          error={work.error}
          stopped={page !== undefined && page.status !== 'active'}
        />
      </StackItem>
      <StackItem>
        <UseOverTimeCard ns={ns} />
      </StackItem>
    </Stack>
  );
};

export default CeamlsProjectOverview;
