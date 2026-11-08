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
import { useVm, useVmi, vmPassword, vmState, vmUser } from './api';
import Password from './Password';
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
  const password = vm ? vmPassword(vm) : undefined;

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
        {/* The sign-in details on one line, so nobody goes back to the machine's
            page for the password. The line wraps on a narrow window. */}
        <Flex
          alignItems={{ default: 'alignItemsCenter' }}
          gap={{ default: 'gapLg' }}
          className="pf-v6-u-mb-md"
          data-testid="ceamls-console-signin"
        >
          <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapSm' }}>
            <FlexItem>
              <Content component="p" className="pf-v6-u-font-weight-bold">
                User name
              </Content>
            </FlexItem>
            <FlexItem>
              <code>{vmUser(vm)}</code>
            </FlexItem>
          </Flex>
          <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapSm' }}>
            <FlexItem>
              <Content component="p" className="pf-v6-u-font-weight-bold">
                Password
              </Content>
            </FlexItem>
            <FlexItem>
              {password ? (
                <div style={{ width: 300, maxWidth: '100%' }}>
                  <Password value={password} />
                </div>
              ) : (
                'This machine was made without a password. Use SSH.'
              )}
            </FlexItem>
          </Flex>
        </Flex>
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
