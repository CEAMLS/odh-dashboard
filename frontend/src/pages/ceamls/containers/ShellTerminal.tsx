// CEAMLS: a shell in a system container, in the browser: xterm.js on the
// pod's exec websocket, through the hub's proxy. The shell is a login shell
// of the image's user, so there is no password. Connects on request.
import * as React from 'react';
import { Alert, Button, Content, Flex, FlexItem } from '@patternfly/react-core';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { shellSocketUrl } from './api';

type Props = {
  ns: string;
  /** The machine's pod; undefined when the machine is off. */
  pod?: string;
  /** The machine runs and its OS is up. */
  running: boolean;
  starting?: boolean;
  user: string;
};

type Phase = 'idle' | 'connecting' | 'open' | 'closed' | 'failed';

// The exec protocol puts the stream number in the first byte of each frame.
const STDIN = 0;
const ERROR = 3;
const RESIZE = 4;

const framed = (channel: number, data: Uint8Array): Uint8Array => {
  const out = new Uint8Array(data.length + 1);
  out[0] = channel;
  out.set(data, 1);
  return out;
};

const ShellTerminal: React.FC<Props> = ({ ns, pod, running, starting = false, user }) => {
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
    if (!holder.current || !pod) {
      return;
    }
    disconnect();
    setNote(undefined);
    setPhase('connecting');
    const t = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      scrollback: 5000,
      theme: { background: '#061a3a' },
    });
    const f = new FitAddon();
    t.loadAddon(f);
    t.open(holder.current);
    f.fit();
    term.current = t;
    fit.current = f;

    const ws = new WebSocket(shellSocketUrl(ns, pod), ['v4.channel.k8s.io']);
    ws.binaryType = 'arraybuffer';
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    // The machine learns the window size, so editors use all of it.
    const sendSize = () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(framed(RESIZE, encoder.encode(JSON.stringify({ Width: t.cols, Height: t.rows }))));
      }
    };
    ws.onopen = () => {
      setPhase('open');
      sendSize();
      t.focus();
    };
    ws.onmessage = (e: MessageEvent<ArrayBuffer | string>) => {
      if (typeof e.data === 'string') {
        return;
      }
      const bytes = new Uint8Array(e.data);
      if (bytes.length < 2) {
        return;
      }
      if (bytes[0] === ERROR) {
        // The shell ended: a Status object. Success is a plain exit.
        const text = decoder.decode(bytes.subarray(1));
        if (!/"status":"Success"/.test(text)) {
          setNote('The shell ended with an error.');
        }
        return;
      }
      t.write(bytes.subarray(1));
    };
    ws.onclose = (e) => {
      socket.current = null;
      setPhase((p) => (p === 'failed' ? p : 'closed'));
      if (e.code !== 1000 && e.reason) {
        setNote(e.reason);
      }
    };
    ws.onerror = () => {
      setPhase('failed');
      setNote('The terminal could not connect.');
    };
    t.onData((d) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(framed(STDIN, encoder.encode(d)));
      }
    });
    t.onResize(sendSize);
    socket.current = ws;
  }, [disconnect, ns, pod]);

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
              <Button variant="secondary" onClick={disconnect} data-testid="ceamls-sc-disconnect">
                Disconnect
              </Button>
            ) : (
              <Button
                variant="secondary"
                onClick={connect}
                isDisabled={!running || !pod}
                data-testid="ceamls-sc-connect"
              >
                {phase === 'idle' || !running ? 'Open terminal' : 'Open terminal again'}
              </Button>
            )}
          </FlexItem>
          <FlexItem>
            <Content component="small">
              {running
                ? `A shell as ${user}, with sudo. No password.`
                : starting
                ? 'The terminal opens when the machine is up.'
                : 'Start the machine to use the terminal.'}
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
          data-testid="ceamls-sc-terminal"
          style={{
            height: live ? 460 : 0,
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

export default ShellTerminal;
