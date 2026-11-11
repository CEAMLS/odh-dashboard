// CEAMLS: the project's S3 access keys and how to use them.
import * as React from 'react';
import { Link } from 'react-router-dom';
import {
  Button,
  ClipboardCopy,
  ClipboardCopyButton,
  CodeBlock,
  CodeBlockAction,
  CodeBlockCode,
  Content,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Grid,
  GridItem,
  InputGroup,
  InputGroupItem,
  Tab,
  TabTitleText,
  Tabs,
  TextInput,
  Title,
} from '@patternfly/react-core';
import { EyeIcon, EyeSlashIcon } from '@patternfly/react-icons';
import { bucketRoute } from '#~/pages/ceamls/routes';
import { getKeys } from './api';
import type { Keys } from './api';
import { ApiErrorState, Loading, useApi } from './common';

const SecretValue: React.FC<{ value: string; shown: boolean; onToggle: () => void }> = ({
  value,
  shown,
  onToggle,
}) => {
  const [copied, setCopied] = React.useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <InputGroup>
      <InputGroupItem isFill>
        <TextInput
          id="ceamls-secret-key"
          type={shown ? 'text' : 'password'}
          value={value}
          readOnlyVariant="default"
          aria-label="Secret key"
        />
      </InputGroupItem>
      <InputGroupItem>
        <Button
          variant="control"
          onClick={onToggle}
          aria-label={shown ? 'Hide the secret key' : 'Show the secret key'}
          icon={shown ? <EyeSlashIcon /> : <EyeIcon />}
        />
      </InputGroupItem>
      <InputGroupItem>
        <ClipboardCopyButton
          id="ceamls-secret-copy"
          textId="ceamls-secret-key"
          variant="control"
          onClick={copy}
          exitDelay={copied ? 1500 : 600}
          aria-label="Copy the secret key"
        >
          {copied ? 'Copied' : 'Copy'}
        </ClipboardCopyButton>
      </InputGroupItem>
    </InputGroup>
  );
};

const snippets = (k: Keys, shown: boolean): { key: string; title: string; code: string }[] => {
  const secret = shown ? k.secretKey ?? '' : '<secret key>';
  const access = k.accessKey ?? '';
  const ext = k.externalEndpoint;
  const bucket = k.bucket ?? `${k.project}-data`;
  return [
    {
      key: 'workbench',
      title: 'Workbench',
      code: `# In a workbench with the connection "Project S3 storage" attached:
import os, boto3
s3 = boto3.client("s3", endpoint_url=os.environ["AWS_S3_ENDPOINT"])
s3.upload_file("data.csv", os.environ["AWS_S3_BUCKET"], "data.csv")
print(s3.list_objects_v2(Bucket=os.environ["AWS_S3_BUCKET"]).get("Contents", []))`,
    },
    {
      key: 'boto3',
      title: 'Python (laptop)',
      code: `import boto3
from botocore.config import Config

s3 = boto3.client(
    "s3",
    endpoint_url="${ext}",
    aws_access_key_id="${access}",
    aws_secret_access_key="${secret}",
    region_name="${k.region}",
    config=Config(s3={"addressing_style": "path"}),
)
s3.upload_file("data.csv", "${bucket}", "data.csv")`,
    },
    {
      key: 'aws',
      title: 'AWS CLI',
      code: `export AWS_ACCESS_KEY_ID="${access}"
export AWS_SECRET_ACCESS_KEY="${secret}"
export AWS_DEFAULT_REGION="${k.region}"
aws --endpoint-url ${ext} s3 ls s3://${bucket}/
aws --endpoint-url ${ext} s3 cp data.csv s3://${bucket}/`,
    },
    {
      key: 'rclone',
      title: 'rclone',
      code: `# ~/.config/rclone/rclone.conf
[ceamls]
type = s3
provider = Ceph
access_key_id = ${access}
secret_access_key = ${secret}
endpoint = ${ext}
region = ${k.region}
force_path_style = true

# then
rclone ls ceamls:${bucket}
rclone copy ./data ceamls:${bucket}/data`,
    },
  ];
};

export const KeysTab: React.FC<{ ns: string }> = ({ ns }) => {
  const { data, error, loading } = useApi(() => getKeys(ns), [ns]);
  const [shown, setShown] = React.useState(false);
  const [tab, setTab] = React.useState<string | number>('workbench');
  const [copied, setCopied] = React.useState<string | undefined>(undefined);
  if (loading && !data) {
    return <Loading />;
  }
  if (error || !data) {
    return error ? <ApiErrorState error={error} ns={ns} /> : null;
  }
  const k = data;
  const copyCode = (key: string, code: string) => {
    void navigator.clipboard.writeText(code);
    setCopied(key);
    setTimeout(() => setCopied(undefined), 1500);
  };
  return (
    <Grid hasGutter md={6}>
      <GridItem>
        <Title headingLevel="h2" className="pf-v6-u-mb-md">
          Access keys
        </Title>
        <DescriptionList>
          <DescriptionListGroup>
            <DescriptionListTerm>Access key</DescriptionListTerm>
            <DescriptionListDescription>
              <ClipboardCopy isReadOnly hoverTip="Copy" clickTip="Copied">
                {k.accessKey ?? ''}
              </ClipboardCopy>
            </DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>Secret key</DescriptionListTerm>
            <DescriptionListDescription>
              <SecretValue
                value={k.secretKey ?? ''}
                shown={shown}
                onToggle={() => setShown((v) => !v)}
              />
            </DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>Endpoint from a laptop</DescriptionListTerm>
            <DescriptionListDescription>
              <ClipboardCopy isReadOnly hoverTip="Copy" clickTip="Copied">
                {k.externalEndpoint}
              </ClipboardCopy>
            </DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>Endpoint inside the cluster</DescriptionListTerm>
            <DescriptionListDescription>
              <ClipboardCopy isReadOnly hoverTip="Copy" clickTip="Copied">
                {k.endpoint ?? ''}
              </ClipboardCopy>
            </DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>Region</DescriptionListTerm>
            <DescriptionListDescription>{k.region}</DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>First bucket</DescriptionListTerm>
            <DescriptionListDescription>
              {k.bucket ? <Link to={bucketRoute(ns, k.bucket)}>{k.bucket}</Link> : '-'}
            </DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>In a workbench</DescriptionListTerm>
            <DescriptionListDescription>
              The connection &quot;Project S3 storage&quot; (Secret {k.connection} in the project)
              carries these values. Attach it to a workbench or a model deployment.
            </DescriptionListDescription>
          </DescriptionListGroup>
        </DescriptionList>
      </GridItem>
      <GridItem>
        <Title headingLevel="h2" className="pf-v6-u-mb-md">
          Use the keys
        </Title>
        <Tabs
          activeKey={tab}
          onSelect={(_e, key) => setTab(key)}
          isBox={false}
          aria-label="Examples"
        >
          {snippets(k, shown).map((s) => (
            <Tab key={s.key} eventKey={s.key} title={<TabTitleText>{s.title}</TabTitleText>}>
              <CodeBlock
                className="pf-v6-u-mt-md"
                actions={
                  <CodeBlockAction>
                    <ClipboardCopyButton
                      id={`ceamls-copy-${s.key}`}
                      textId={`ceamls-code-${s.key}`}
                      variant="plain"
                      onClick={() => copyCode(s.key, s.code)}
                      exitDelay={copied === s.key ? 1500 : 600}
                      aria-label="Copy to clipboard"
                    >
                      {copied === s.key ? 'Copied' : 'Copy'}
                    </ClipboardCopyButton>
                  </CodeBlockAction>
                }
              >
                <CodeBlockCode id={`ceamls-code-${s.key}`}>{s.code}</CodeBlockCode>
              </CodeBlock>
            </Tab>
          ))}
        </Tabs>
        {!shown && (
          <Content component="p" className="pf-v6-u-mt-sm pf-v6-u-color-200">
            The examples show the secret key once you reveal it on the left.
          </Content>
        )}
      </GridItem>
    </Grid>
  );
};
