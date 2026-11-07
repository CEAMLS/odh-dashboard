// CEAMLS: the Buckets page of one project: the Buckets tab and the Access
// keys tab, under the project selector.
import * as React from 'react';
import { PageSection, Tab, TabTitleText, Tabs } from '@patternfly/react-core';
import { ProjectDetailsContext } from '#~/pages/projects/ProjectDetailsContext';
import ProjectScopedPage from '#~/pages/ceamls/ProjectScopedPage';
import { bucketsRoute } from '#~/pages/ceamls/routes';
import { BucketsTab } from './BucketsTab';
import { KeysTab } from './KeysTab';

export const bucketsTitle = 'Buckets';
export const bucketsDescription =
  'S3 buckets of the project on the cluster object store. Every workbench, VM, pipeline and model of the project, the console and your computer reach them. A bucket name is unique on the whole store.';

const BucketsPage: React.FC = () => {
  const { currentProject } = React.useContext(ProjectDetailsContext);
  const ns = currentProject.metadata.name;
  const [tab, setTab] = React.useState<string | number>('buckets');
  return (
    <ProjectScopedPage
      title={bucketsTitle}
      description={bucketsDescription}
      getRedirectPath={bucketsRoute}
    >
      <PageSection hasBodyWrapper={false}>
        <Tabs
          activeKey={tab}
          onSelect={(_e, key) => setTab(key)}
          aria-label="Buckets and access keys"
          className="pf-v6-u-mb-md"
        >
          <Tab eventKey="buckets" title={<TabTitleText>Buckets</TabTitleText>} />
          <Tab eventKey="keys" title={<TabTitleText>Access keys</TabTitleText>} />
        </Tabs>
        {tab === 'buckets' ? <BucketsTab ns={ns} /> : <KeysTab ns={ns} />}
      </PageSection>
    </ProjectScopedPage>
  );
};

export default BucketsPage;
