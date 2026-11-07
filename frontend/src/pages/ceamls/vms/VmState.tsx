// CEAMLS: the machine's state as an icon and a word. The word carries the
// meaning; the icon only repeats it.
import * as React from 'react';
import { Icon, Spinner } from '@patternfly/react-core';
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  PauseCircleIcon,
  PowerOffIcon,
} from '@patternfly/react-icons';
import type { VmState } from './api';

const VmStateLabel: React.FC<{ state: VmState }> = ({ state }) => {
  let icon: React.ReactNode;
  switch (state.tone) {
    case 'ok':
      icon = (
        <Icon status="success" isInline>
          <CheckCircleIcon />
        </Icon>
      );
      break;
    case 'bad':
      icon = (
        <Icon status="danger" isInline>
          <ExclamationCircleIcon />
        </Icon>
      );
      break;
    case 'wait':
      icon = state.busy ? (
        <Spinner size="sm" aria-hidden="true" />
      ) : (
        <Icon isInline>
          <PauseCircleIcon />
        </Icon>
      );
      break;
    default:
      icon = (
        <Icon isInline>
          <PowerOffIcon />
        </Icon>
      );
  }
  return (
    <span data-testid="ceamls-vm-state" style={{ whiteSpace: 'nowrap' }}>
      {icon} <span className="pf-v6-u-ml-xs">{state.word}</span>
    </span>
  );
};

export default VmStateLabel;
