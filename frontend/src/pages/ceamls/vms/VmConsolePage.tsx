// CEAMLS: the machine's console alone, for a tab of its own. Connects by
// itself when the machine runs.
import * as React from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Breadcrumb,
  BreadcrumbItem,
  Content,
  Flex,
  FlexItem,
  PageSection,
} from '@patternfly/react-core';
import { ApplicationsPage } from '@odh-dashboard/ui-core';
import { ProjectDetailsContext } from '#~/pages/projects/ProjectDetailsContext';
import { vmRoute, vmsRoute } from '#~/pages/ceamls/routes';
import { Loading } from '#~/pages/ceamls/buckets/common';
import { useVm, useVmi, vmState, vmUser } from './api';
import SerialConsole from './SerialConsole';
import VmStateLabel from './VmState';

const VmConsolePage: React.FC = () => {
  const { currentProject } = React.useContext(ProjectDetailsContext);
  const ns = currentProject.metadata.name;
  const { name = '' } = useParams();
  const [vm, vmLoaded] = useVm(ns, name);
  const [vmi] = useVmi(ns, name);
  const state = vmState(vm, vmi);
  const running = state.tone === 'ok';

  React.useEffect(() => {
    const old = document.title;
    document.title = `${name} console`;
    return () => {
      document.title = old;
    };
  }, [name]);

  const breadcrumb = (
    <Breadcrumb>
      <BreadcrumbItem render={() => <Link to={vmsRoute(ns)}>Virtual machines</Link>} />
      <BreadcrumbItem render={() => <Link to={vmRoute(ns, name)}>{name}</Link>} />
      <BreadcrumbItem isActive>Console</BreadcrumbItem>
    </Breadcrumb>
  );

  if (!vm) {
    return (
      <ApplicationsPage
        title={`${name} console`}
        breadcrumb={breadcrumb}
        loaded={vmLoaded}
        empty={false}
      >
        {vmLoaded ? (
          <PageSection hasBodyWrapper={false}>
            <Content component="p">
              No machine with this name. <Link to={vmsRoute(ns)}>Back to the list</Link>
            </Content>
          </PageSection>
        ) : (
          <Loading />
        )}
      </ApplicationsPage>
    );
  }

  return (
    <ApplicationsPage
      title={
        <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapMd' }}>
          <FlexItem>{name} console</FlexItem>
          <FlexItem>
            <Content component="p" className="pf-v6-u-font-size-md pf-v6-u-font-weight-normal">
              <VmStateLabel state={state} />
            </Content>
          </FlexItem>
        </Flex>
      }
      breadcrumb={breadcrumb}
      loaded
      empty={false}
    >
      <PageSection hasBodyWrapper={false}>
        <SerialConsole
          ns={ns}
          name={name}
          running={running}
          starting={state.tone === 'wait'}
          user={vmUser(vm)}
          autoConnect
          tall
        />
      </PageSection>
    </ApplicationsPage>
  );
};

export default VmConsolePage;
