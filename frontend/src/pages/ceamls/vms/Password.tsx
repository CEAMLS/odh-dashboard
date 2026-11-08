// CEAMLS: a machine's password, hidden until shown, with a Copy button.
import * as React from 'react';
import { Button, InputGroup, InputGroupItem, TextInput } from '@patternfly/react-core';
import { CopyIcon, EyeIcon, EyeSlashIcon } from '@patternfly/react-icons';

const Password: React.FC<{ value: string }> = ({ value }) => {
  const [shown, setShown] = React.useState(false);
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
          id="ceamls-vm-password"
          type={shown ? 'text' : 'password'}
          value={value}
          readOnlyVariant="default"
          aria-label="Password"
        />
      </InputGroupItem>
      <InputGroupItem>
        <Button
          variant="control"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? 'Hide the password' : 'Show the password'}
          icon={shown ? <EyeSlashIcon /> : <EyeIcon />}
        />
      </InputGroupItem>
      <InputGroupItem>
        <Button variant="control" onClick={copy} aria-label="Copy the password" icon={<CopyIcon />}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </InputGroupItem>
    </InputGroup>
  );
};

export default Password;
