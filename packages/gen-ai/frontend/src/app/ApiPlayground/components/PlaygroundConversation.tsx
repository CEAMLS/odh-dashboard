import * as React from 'react';
import {
  Alert,
  Button,
  ButtonVariant,
  Card,
  CardBody,
  CardFooter,
  CardTitle,
  Content,
  ExpandableSection,
  Flex,
  FlexItem,
  Form,
  FormGroup,
  TextArea,
} from '@patternfly/react-core';
import { PaperPlaneIcon, StopIcon, TrashIcon } from '@patternfly/react-icons';
import { Message } from '@patternfly/chatbot';
import botAvatar from '~/app/bgimages/bot_avatar.svg';
import userAvatar from '~/app/bgimages/user_avatar.svg';
import { PlaygroundUsage } from '~/app/ApiPlayground/utils';

export type PlaygroundTurn = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  usage?: PlaygroundUsage;
  durationMs?: number;
  finishReason?: string;
  error?: string;
  pending?: boolean;
};

type PlaygroundConversationProps = {
  modelLabel: string;
  systemPrompt: string;
  onChangeSystemPrompt: (value: string) => void;
  turns: PlaygroundTurn[];
  input: string;
  onChangeInput: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  onClear: () => void;
  canSend: boolean;
  isBusy: boolean;
};

const replyFooter = (turn: PlaygroundTurn): string => {
  const parts: string[] = [];
  if (turn.usage) {
    parts.push(
      `${turn.usage.promptTokens} prompt + ${turn.usage.completionTokens} completion = ${turn.usage.totalTokens} tokens`,
    );
  }
  if (turn.durationMs !== undefined) {
    parts.push(`${(turn.durationMs / 1000).toFixed(1)} s`);
  }
  if (turn.finishReason && turn.finishReason !== 'stop') {
    parts.push(`finish reason: ${turn.finishReason}`);
  }
  return parts.join(' · ');
};

const PlaygroundConversation: React.FC<PlaygroundConversationProps> = ({
  modelLabel,
  systemPrompt,
  onChangeSystemPrompt,
  turns,
  input,
  onChangeInput,
  onSend,
  onStop,
  onClear,
  canSend,
  isBusy,
}) => {
  const [systemOpen, setSystemOpen] = React.useState(false);
  const endRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [turns]);

  return (
    <Card isFullHeight data-testid="api-playground-conversation">
      <CardTitle>
        <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }}>
          <FlexItem>Conversation</FlexItem>
          <FlexItem>
            <Button
              variant={ButtonVariant.link}
              icon={<TrashIcon />}
              onClick={onClear}
              isDisabled={isBusy || turns.length === 0}
              data-testid="api-playground-clear"
            >
              Clear
            </Button>
          </FlexItem>
        </Flex>
      </CardTitle>
      <CardBody>
        <ExpandableSection
          toggleText={systemPrompt.trim() ? 'System prompt (set)' : 'System prompt'}
          isExpanded={systemOpen}
          onToggle={(_e, expanded) => setSystemOpen(expanded)}
          isIndented
        >
          <TextArea
            id="api-playground-system"
            aria-label="System prompt"
            value={systemPrompt}
            onChange={(_e, value) => onChangeSystemPrompt(value)}
            placeholder="Instructions the model follows for the whole conversation. Optional."
            rows={3}
            resizeOrientation="vertical"
            isDisabled={isBusy}
            data-testid="api-playground-system-prompt"
          />
        </ExpandableSection>
        <div
          style={{ minHeight: '40vh', maxHeight: '60vh', overflowY: 'auto' }}
          className="pf-v6-u-mt-md"
          data-testid="api-playground-messages"
        >
          {turns.length === 0 && (
            <Content component="p" className="pf-v6-u-color-200">
              Send a message to {modelLabel || 'the model'}. The reply shows the tokens it used.
            </Content>
          )}
          {turns.map((turn) =>
            turn.role === 'user' ? (
              <Message
                key={turn.id}
                // eslint-disable-next-line jsx-a11y/aria-role
                role="user"
                name="You"
                avatar={userAvatar}
                content={turn.content}
                data-testid="api-playground-user-message"
              />
            ) : (
              <Message
                key={turn.id}
                // eslint-disable-next-line jsx-a11y/aria-role
                role="bot"
                name={modelLabel || 'Model'}
                avatar={botAvatar}
                content={turn.content}
                isLoading={turn.pending && !turn.content}
                data-testid="api-playground-reply"
                extraContent={{
                  endContent: (
                    <>
                      {turn.error && (
                        <Alert
                          variant="danger"
                          isInline
                          isPlain
                          title={turn.error}
                          data-testid="api-playground-error"
                        />
                      )}
                      {!turn.pending && replyFooter(turn) && (
                        <Content
                          component="small"
                          className="pf-v6-u-color-200"
                          data-testid="api-playground-usage"
                        >
                          {replyFooter(turn)}
                        </Content>
                      )}
                    </>
                  ),
                }}
              />
            ),
          )}
          <div ref={endRef} />
        </div>
      </CardBody>
      <CardFooter>
        <Form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSend) {
              onSend();
            }
          }}
        >
          <FormGroup fieldId="api-playground-input">
            <TextArea
              id="api-playground-input"
              aria-label="Message"
              value={input}
              onChange={(_e, value) => onChangeInput(value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (canSend) {
                    onSend();
                  }
                }
              }}
              placeholder="Type a message. Enter sends, Shift+Enter adds a line."
              rows={3}
              resizeOrientation="vertical"
              isDisabled={isBusy}
              data-testid="api-playground-input"
            />
          </FormGroup>
          <Flex>
            <FlexItem>
              <Button
                type="submit"
                variant={ButtonVariant.primary}
                icon={<PaperPlaneIcon />}
                isDisabled={!canSend}
                data-testid="api-playground-send"
              >
                Send
              </Button>
            </FlexItem>
            {isBusy && (
              <FlexItem>
                <Button
                  variant={ButtonVariant.secondary}
                  icon={<StopIcon />}
                  onClick={onStop}
                  data-testid="api-playground-stop"
                >
                  Stop
                </Button>
              </FlexItem>
            )}
          </Flex>
        </Form>
      </CardFooter>
    </Card>
  );
};

export default PlaygroundConversation;
