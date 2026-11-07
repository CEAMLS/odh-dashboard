// CEAMLS: the machine's serial console in the browser: xterm.js on the
// KubeVirt console subresource, through the hub's websocket proxy. Connects
// on request, not on page load.
import * as React from 'react';
import { Alert, Button, Content, Flex, FlexItem } from '@patternfly/react-core';
import { ExpandIcon } from '@patternfly/react-icons';
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
  const frame = React.useRef<HTMLDivElement>(null);
  const [phase, setPhase] = React.useState<Phase>('idle');
  const [note, setNote] = React.useState<string | undefined>(undefined);
  const [full, setFull] = React.useState(false);
  const [dims, setDims] = React.useState<{ cols: number; rows: number } | undefined>(undefined);

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

    t.onResize(({ cols, rows }) => setDims({ cols, rows }));
    setDims({ cols: t.cols, rows: t.rows });

    const ws = new WebSocket(consoleSocketUrl(ns, name), ['plain.kubevirt.io']);
    ws.binaryType = 'arraybuffer';
    const encoder = new TextEncoder();
    ws.onopen = () => {
      setPhase('open');
      t.focus();
      // A newline wakes the login prompt on a quiet console. A second one a
      // moment later puts the prompt back under the last boot lines.
      ws.send(encoder.encode('\n'));
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(encoder.encode('\n'));
        }
      }, 1500);
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
    const onChange = () => setFull(document.fullscreenElement === frame.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFull = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void frame.current?.requestFullscreen();
    }
  };

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
                {phase === 'idle' || !running ? 'Connect' : 'Connect again'}
              </Button>
            )}
          </FlexItem>
          {live && (
            <FlexItem>
              <Button
                variant="secondary"
                icon={<ExpandIcon />}
                onClick={toggleFull}
                data-testid="ceamls-console-fullscreen"
              >
                Full screen
              </Button>
            </FlexItem>
          )}
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
          ref={frame}
          style={
            full
              ? {
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100vh',
                  background: '#061a3a',
                }
              : undefined
          }
        >
          <div
            ref={holder}
            data-testid="ceamls-console"
            style={{
              flex: full ? 1 : undefined,
              minHeight: 0,
              height: full ? undefined : live ? 420 : 0,
              overflow: 'hidden',
              borderRadius: full ? 0 : 6,
              background: '#061a3a',
              padding: live ? 8 : 0,
            }}
          />
          {full && (
            <div
              style={{
                color: '#c8d3e6',
                fontSize: 13,
                padding: '6px 12px',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              }}
            >
              Esc leaves full screen.
              {dims
                ? ` The machine does not know the window size: run stty cols ${dims.cols} rows ${dims.rows} so editors use all of it.`
                : ''}
            </div>
          )}
        </div>
      </FlexItem>
    </Flex>
  );
};

export default SerialConsole;
