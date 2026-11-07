import * as React from 'react';
import { NavItem } from '@patternfly/react-core';
import { Link, useMatch } from 'react-router-dom';
import { ExternalLinkAltIcon } from '@patternfly/react-icons';
import type {
  HrefNavItemExtension,
  StatusReport,
} from '@odh-dashboard/plugin-core/extension-points';
import { fireLinkTrackingEvent } from '#~/concepts/analyticsTracking/segmentIOUtils';
import { StatusReportLoader } from '#~/app/status-provider/StatusReportLoader';
import { StatusReportIcon } from '#~/app/status-provider/StatusReportIcon';
import { NavItemTitle } from './NavItemTitle';
import NavIcon from './NavIcon';

type Props = {
  extension: HrefNavItemExtension;
  onNotifyStatus?: (status: StatusReport | undefined) => void;
};

export const NavItemHref: React.FC<Props> = ({
  extension: {
    properties: {
      href,
      path,
      dataAttributes,
      title,
      statusProviderId,
      iconRef,
      label,
      trackingEvent,
    },
  },
  onNotifyStatus,
}) => {
  const [status, setStatus] = React.useState<StatusReport | undefined>(undefined);
  // CEAMLS: an item whose href is an outside address (CEAMLS Chat) is a plain
  // link in a new tab, not a router Link, and is never the active item.
  const isExternal = /^https?:\/\//.test(href);
  const isMatch = !!useMatch(isExternal ? '/__never__' : path ?? href);

  React.useEffect(
    () => () => {
      onNotifyStatus?.(undefined);
    },
    // notify on unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleClick = React.useCallback(() => {
    if (!isMatch && trackingEvent) {
      fireLinkTrackingEvent(trackingEvent.name, {
        from: window.location.pathname,
        section: trackingEvent.section,
      });
    }
  }, [isMatch, trackingEvent]);

  return (
    <>
      <NavItem isActive={isMatch} onClick={handleClick}>
        {isExternal ? (
          <a {...dataAttributes} href={href} target="_blank" rel="noopener noreferrer">
            <NavItemTitle
              title={
                <>
                  {title} <ExternalLinkAltIcon />
                </>
              }
              navIcon={iconRef ? <NavIcon componentRef={iconRef} /> : null}
              label={label}
            />
          </a>
        ) : (
          <Link {...dataAttributes} to={href}>
            <NavItemTitle
              title={title}
              navIcon={iconRef ? <NavIcon componentRef={iconRef} /> : null}
              statusIcon={status ? <StatusReportIcon status={status} isInline /> : null}
              label={label}
            />
          </Link>
        )}
      </NavItem>
      {statusProviderId ? (
        <StatusReportLoader
          statusProviderId={statusProviderId}
          onLoad={(_, summaryReport) => {
            onNotifyStatus?.(summaryReport);
            setStatus(summaryReport);
          }}
        />
      ) : null}
    </>
  );
};
