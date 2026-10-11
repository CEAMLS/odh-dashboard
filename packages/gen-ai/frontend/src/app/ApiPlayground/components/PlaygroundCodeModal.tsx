import * as React from 'react';
import {
  ClipboardCopyButton,
  CodeBlock,
  CodeBlockAction,
  CodeBlockCode,
  Content,
  Modal,
  ModalBody,
  ModalHeader,
  ModalVariant,
  Tab,
  TabTitleText,
  Tabs,
} from '@patternfly/react-core';
import { AIModel } from '~/app/types';
import {
  CodeSampleLanguage,
  buildCodeSample,
  codeSampleLanguages,
  credentialHint,
} from '~/app/ApiPlayground/codeSamples';
import { PlaygroundRequestBody } from '~/app/ApiPlayground/utils';

type PlaygroundCodeModalProps = {
  model: AIModel;
  body: PlaygroundRequestBody;
  onClose: () => void;
};

const PlaygroundCodeModal: React.FC<PlaygroundCodeModalProps> = ({ model, body, onClose }) => {
  const [language, setLanguage] = React.useState<CodeSampleLanguage>('curl');
  const [copied, setCopied] = React.useState(false);
  const code = React.useMemo(() => buildCodeSample(language, model, body), [language, model, body]);

  return (
    <Modal isOpen variant={ModalVariant.large} onClose={onClose} data-testid="api-playground-code">
      <ModalHeader title="View code" />
      <ModalBody>
        <Content component="p">
          The same request as a direct call to the model endpoint. Set the <code>API_KEY</code>{' '}
          variable first. {credentialHint(model)}
        </Content>
        <Tabs
          activeKey={language}
          onSelect={(_e, key) => {
            const match = codeSampleLanguages.find((l) => l.id === String(key));
            setLanguage(match?.id ?? 'curl');
          }}
          aria-label="Code sample language"
        >
          {codeSampleLanguages.map((l) => (
            <Tab key={l.id} eventKey={l.id} title={<TabTitleText>{l.label}</TabTitleText>} />
          ))}
        </Tabs>
        <CodeBlock
          actions={
            <CodeBlockAction>
              <ClipboardCopyButton
                id="api-playground-code-copy"
                textId="api-playground-code-text"
                aria-label="Copy to clipboard"
                onClick={() => {
                  navigator.clipboard.writeText(code).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  });
                }}
                exitDelay={copied ? 1500 : 600}
                variant="plain"
              >
                {copied ? 'Copied' : 'Copy to clipboard'}
              </ClipboardCopyButton>
            </CodeBlockAction>
          }
        >
          <CodeBlockCode id="api-playground-code-text">{code}</CodeBlockCode>
        </CodeBlock>
      </ModalBody>
    </Modal>
  );
};

export default PlaygroundCodeModal;
