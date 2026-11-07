// CEAMLS: the machine's serial console in the browser: xterm.js on the
// KubeVirt console subresource, through the hub's websocket proxy. Connects
// on request, not on page load.
import * as React from 'react';
import { Alert, Button, Content, Flex, FlexItem } from '@patternfly/react-core';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { consoleSocketUrl } from './api';

type Props = {
  ns: string;
  name: string;
  /** The machine runs; the console can connect. */
  running: boolean;
  user: string;
};

type Phase = 'idle' | 'connecting' | 'open' | 'closed' | 'failed';

const SerialConsole: React.FC<Props> = ({ ns, name, running, user }) => {
  const holder = React.useRef<HTMLDivElement>(null);
  const term = React.useRef<Terminal | null>(null);
  const fit = React.useRef<FitAddon | null>(null);
  const socket = React.useRef<WebSocket | null>(null);
  const [phase, setPhase] = React.useState<Phase>('idle');
  const [note, setNote] = React.useState<string | undefined>(undefined);

  const disconnect = React.useCallback(() => {
    socket.current?.close();
    socket.current = null;
    term.current?.dispose();
    term.current = null;
    fit.current = null;
  }, []);

  const connect = React.useCallback(() => {
    if (!holder.current) {
      return;
    }
    disconnect();
    setNote(undefined);
    setPhase('connecting');
    const t = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      convertEol: false,
      scrollback: 2000,
      theme: { background: '#061a3a' },
    });
    const f = new FitAddon();
    t.loadAddon(f);
    t.open(holder.current);
    holder.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    f.fit();
    term.current = t;
    fit.current = f;

    const ws = new WebSocket(consoleSocketUrl(ns, name), ['plain.kubevirt.io']);
    ws.binaryType = 'arraybuffer';
    const encoder = new TextEncoder();
    ws.onopen = () => {
      setPhase('open');
      t.focus();
      // A newline wakes the login prompt on a quiet console.
      ws.send(encoder.encode('\n'));
    };
    ws.onmessage = (e: MessageEvent<ArrayBuffer | string>) => {
      if (typeof e.data === 'string') {
        t.write(e.data);
      } else {
        t.write(new Uint8Array(e.data));
      }
    };
    ws.onclose = (e) => {
      socket.current = null;
      setPhase(e.code === 1000 ? 'closed' : 'failed');
      if (e.code !== 1000) {
        setNote(e.reason || 'The connection closed.');
      }
    };
    ws.onerror = () => {
      setPhase('failed');
      setNote('The console could not connect.');
    };
    t.onData((d) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(encoder.encode(d));
      }
    });
    socket.current = ws;
  }, [disconnect, ns, name]);

  React.useEffect(() => () => disconnect(), [disconnect]);

  React.useEffect(() => {
    if (!holder.current) {
      return undefined;
    }
    const ro = new ResizeObserver(() => fit.current?.fit());
    ro.observe(holder.current);
    return () => ro.disconnect();
  }, []);

  React.useEffect(() => {
    if (!running && phase === 'open') {
      disconnect();
      setPhase('closed');
      setNote('The machine stopped.');
    }
  }, [running, phase, disconnect]);

  const live = phase === 'open' || phase === 'connecting';
  return (
    <Flex direction={{ default: 'column' }} gap={{ default: 'gapSm' }}>
      <FlexItem>
        <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapSm' }}>
          <FlexItem>
            {live ? (
              <Button
                variant="secondary"
                onClick={disconnect}
                data-testid="ceamls-console-disconnect"
              >
                Disconnect
              </Button>
            ) : (
              <Button
                variant="secondary"
                onClick={connect}
                isDisabled={!running}
                data-testid="ceamls-console-connect"
              >
                {phase === 'idle' ? 'Connect' : 'Connect again'}
              </Button>
            )}
          </FlexItem>
          <FlexItem>
            <Content component="small">
              {running
                ? `Sign in as ${user} with the password above. The console works when SSH does not.`
                : 'Start the machine to use the console.'}
            </Content>
          </FlexItem>
        </Flex>
      </FlexItem>
      {note && (
        <FlexItem>
          <Alert variant={phase === 'failed' ? 'warning' : 'info'} isInline isPlain title={note} />
        </FlexItem>
      )}
      <FlexItem>
        <div
          ref={holder}
          data-testid="ceamls-console"
          style={{
            height: live ? 420 : 0,
            overflow: 'hidden',
            borderRadius: 6,
            background: '#061a3a',
            padding: live ? 8 : 0,
          }}
        />
      </FlexItem>
    </Flex>
  );
};

export default SerialConsole;
