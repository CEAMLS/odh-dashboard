// CEAMLS: the last lines the machine wrote to its serial port, read from
// the launcher pod's log. Works while the machine starts, before a console
// can connect, and after a failed boot.
import * as React from 'react';
import { Alert, Button, Content, Flex, FlexItem } from '@patternfly/react-core';
import { errorMessage, fetchBootLog, useLauncherPod } from './api';

const LINES = 200;

const BootLog: React.FC<{ ns: string; name: string; active: boolean }> = ({ ns, name, active }) => {
  const pod = useLauncherPod(ns, name, active);
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState<string | undefined>(undefined);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [busy, setBusy] = React.useState(false);
  const pre = React.useRef<HTMLPreElement>(null);

  const read = React.useCallback(() => {
    if (!pod) {
      return;
    }
    setBusy(true);
    setError(undefined);
    fetchBootLog(ns, pod, LINES)
      .then((t) => {
        setText(t);
        setTimeout(() => {
          if (pre.current) {
            pre.current.scrollTop = pre.current.scrollHeight;
          }
        }, 0);
      })
      .catch((e: unknown) => setError(errorMessage(e)))
      .finally(() => setBusy(false));
  }, [ns, pod]);

  React.useEffect(() => {
    if (open) {
      read();
    }
  }, [open, read]);

  return (
    <Flex direction={{ default: 'column' }} gap={{ default: 'gapSm' }}>
      <FlexItem>
        <Flex gap={{ default: 'gapSm' }} alignItems={{ default: 'alignItemsCenter' }}>
          <FlexItem>
            <Button
              variant="secondary"
              onClick={() => setOpen((o) => !o)}
              isDisabled={!pod}
              data-testid="ceamls-boot-log"
            >
              {open ? 'Hide the boot log' : 'Boot log'}
            </Button>
          </FlexItem>
          {open && (
            <FlexItem>
              <Button variant="link" isInline onClick={read} isDisabled={busy || !pod}>
                {busy ? 'Reading…' : 'Refresh'}
              </Button>
            </FlexItem>
          )}
          <FlexItem>
            <Content component="small">
              {pod
                ? `The last ${LINES} lines the machine wrote to its serial port.`
                : 'The boot log exists while the machine runs or starts.'}
            </Content>
          </FlexItem>
        </Flex>
      </FlexItem>
      {open && error && (
        <FlexItem>
          <Alert variant="warning" isInline isPlain title={error} />
        </FlexItem>
      )}
      {open && text !== undefined && (
        <FlexItem>
          <pre
            ref={pre}
            data-testid="ceamls-boot-log-text"
            style={{
              maxHeight: 320,
              overflow: 'auto',
              margin: 0,
              padding: 12,
              borderRadius: 6,
              background: '#061a3a',
              color: '#c8d3e6',
              fontSize: 13,
              lineHeight: 1.4,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {text.trim() || 'Nothing yet.'}
          </pre>
        </FlexItem>
      )}
    </Flex>
  );
};

export default BootLog;
