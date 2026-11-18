// CEAMLS: the one-page form that makes a system container: a name, an
// image, CPUs, memory, a disk and GPU shares. A trial for administrators.
import * as React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ActionGroup,
  Alert,
  Breadcrumb,
  BreadcrumbItem,
  Button,
  Content,
  Flex,
  FlexItem,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  PageSection,
  Radio,
  TextInput,
} from '@patternfly/react-core';
import { ApplicationsPage } from '@odh-dashboard/ui-core';
import NumberInputWrapper from '@odh-dashboard/ui-core/components/NumberInputWrapper';
import { getDisplayNameFromK8sResource } from '@odh-dashboard/k8s-core';
import { ProjectDetailsContext } from '#~/pages/projects/ProjectDetailsContext';
import { useUser } from '#~/redux/selectors';
import { containerRoute, containersRoute } from '#~/pages/ceamls/routes';
import { NAME_RE, errorMessage, formatBytes, useRoom } from '#~/pages/ceamls/vms/api';
import { IMAGES, containerName, createContainer, useContainers, useGpuRoom } from './api';

const CPU_MAX = 64;
const MEMORY_MAX = 512;
const DISK_MIN = 10;
const DISK_MAX = 1000;
const DISK_DEFAULT = 30;
// "sc-<name>-root" is the longest object name, and a label value holds 63.
const NAME_MAX = 50;
const GIB = 1024 ** 3;

const CreateContainerPage: React.FC = () => {
  const { currentProject } = React.useContext(ProjectDetailsContext);
  const ns = currentProject.metadata.name;
  const navigate = useNavigate();
  const [machines] = useContainers(ns);
  const room = useRoom(ns);
  const gpuRoom = useGpuRoom(ns);
  const { username } = useUser();

  const [name, setName] = React.useState('');
  const [touched, setTouched] = React.useState(false);
  const [imageName, setImageName] = React.useState(IMAGES[0].name);
  const [cpu, setCpu] = React.useState<number | undefined>(4);
  const [memory, setMemory] = React.useState<number | undefined>(16);
  const [disk, setDisk] = React.useState<number | undefined>(DISK_DEFAULT);
  const [gpus, setGpus] = React.useState<number | undefined>(0);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);

  const image = IMAGES.find((i) => i.name === imageName) ?? IMAGES[0];

  let nameError: string | undefined;
  if (!name) {
    nameError = 'Give the machine a name.';
  } else if (name.length > NAME_MAX || !NAME_RE.test(name)) {
    nameError = `Lowercase letters, digits and dashes, at most ${NAME_MAX} characters.`;
  } else if (machines.some((m) => containerName(m) === name)) {
    nameError = 'A system container with this name exists in the project.';
  }

  let sizeError: string | undefined;
  if (
    cpu === undefined ||
    memory === undefined ||
    cpu < 1 ||
    cpu > CPU_MAX ||
    memory < 1 ||
    memory > MEMORY_MAX
  ) {
    sizeError = `Between 1 and ${CPU_MAX} CPUs, and between 1 and ${MEMORY_MAX} GiB of memory.`;
  } else if (room.cpuFree !== undefined && cpu > room.cpuFree) {
    sizeError = `The project has ${room.cpuFree} ${room.cpuFree === 1 ? 'CPU' : 'CPUs'} free of ${
      room.cpuTotal ?? 0
    }. Take fewer, or stop a workbench or a machine.`;
  } else if (room.memoryFree !== undefined && memory * GIB > room.memoryFree) {
    sizeError = `The project has ${formatBytes(room.memoryFree)} of memory free of ${formatBytes(
      room.memoryTotal ?? 0,
    )}. Take less, or stop a workbench or a machine.`;
  }

  let diskError: string | undefined;
  if (disk === undefined || disk < DISK_MIN || disk > DISK_MAX) {
    diskError = `Between ${DISK_MIN} and ${DISK_MAX} GiB.`;
  } else if (room.diskFree !== undefined && disk * GIB > room.diskFree) {
    diskError = `The project has ${formatBytes(
      room.diskFree,
    )} of disk space free. Pick a smaller disk, or delete a volume or a machine you do not need.`;
  }

  const gpuCount = gpus ?? 0;
  const gpuError =
    gpuCount > gpuRoom.free
      ? `The project has ${gpuRoom.free} of ${gpuRoom.total} GPU shares free. Stop a workbench or a machine that holds one.`
      : undefined;

  const valid =
    !nameError &&
    !sizeError &&
    !diskError &&
    !gpuError &&
    cpu !== undefined &&
    memory !== undefined &&
    disk !== undefined;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !valid) {
      setTouched(true);
      return;
    }
    setBusy(true);
    setError(undefined);
    createContainer(
      ns,
      { name, image, cpu, memoryGiB: memory, diskGiB: disk, gpus: gpuCount },
      username,
    )
      .then(() => navigate(containerRoute(ns, name)))
      .catch((err: unknown) => {
        setError(errorMessage(err));
        setBusy(false);
      });
  };

  return (
    <ApplicationsPage
      title="Create system container"
      description={`A Linux machine in ${getDisplayNameFromK8sResource(
        currentProject,
      )} that shares the kernel of its node. It starts as soon as it is made.`}
      breadcrumb={
        <Breadcrumb>
          <BreadcrumbItem render={() => <Link to={containersRoute(ns)}>System containers</Link>} />
          <BreadcrumbItem isActive>Create system container</BreadcrumbItem>
        </Breadcrumb>
      }
      loaded
      empty={false}
    >
      <PageSection hasBodyWrapper={false} isWidthLimited>
        <Form onSubmit={submit} maxWidth="640px" data-testid="ceamls-create-sc">
          <FormGroup label="Name" isRequired fieldId="ceamls-sc-name">
            <TextInput
              id="ceamls-sc-name"
              value={name}
              onChange={(_e, v) => setName(v.toLowerCase().replace(/\s+/g, '-'))}
              onBlur={() => setTouched(true)}
              validated={touched && nameError ? 'error' : 'default'}
              aria-describedby="ceamls-sc-name-help"
              isRequired
              autoFocus
            />
            <FormHelperText>
              <HelperText id="ceamls-sc-name-help">
                <HelperTextItem variant={touched && nameError ? 'error' : 'default'}>
                  {touched && nameError
                    ? nameError
                    : 'Lowercase letters, digits and dashes. It is the host name of the machine.'}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>

          <FormGroup label="Image" isRequired role="radiogroup" fieldId="ceamls-sc-image">
            {IMAGES.map((img) => (
              <Radio
                key={img.name}
                id={`ceamls-sc-image-${img.name}`}
                name="ceamls-sc-image"
                label={img.title}
                description={`${img.note} Signs in as ${img.user}.`}
                isChecked={imageName === img.name}
                onChange={() => setImageName(img.name)}
              />
            ))}
          </FormGroup>

          <FormGroup label="Size" isRequired fieldId="ceamls-sc-cpu">
            <Flex gap={{ default: 'gapLg' }}>
              <FlexItem>
                <NumberInputWrapper
                  id="ceamls-sc-cpu"
                  value={cpu}
                  min={1}
                  max={CPU_MAX}
                  unit={cpu === 1 ? 'CPU' : 'CPUs'}
                  widthChars={4}
                  onChange={(v) => setCpu(v)}
                  inputAriaLabel="CPUs"
                  minusBtnAriaLabel="One CPU less"
                  plusBtnAriaLabel="One CPU more"
                />
              </FlexItem>
              <FlexItem>
                <NumberInputWrapper
                  id="ceamls-sc-memory"
                  value={memory}
                  min={1}
                  max={MEMORY_MAX}
                  unit="GiB of memory"
                  widthChars={5}
                  onChange={(v) => setMemory(v)}
                  inputAriaLabel="Memory in GiB"
                  minusBtnAriaLabel="1 GiB less"
                  plusBtnAriaLabel="1 GiB more"
                />
              </FlexItem>
            </Flex>
            <FormHelperText>
              <HelperText>
                <HelperTextItem variant={sizeError ? 'error' : 'default'}>
                  {sizeError ??
                    `They count against the project quota while the machine runs.${
                      room.cpuFree !== undefined
                        ? ` The project has ${room.cpuFree} ${
                            room.cpuFree === 1 ? 'CPU' : 'CPUs'
                          } and ${formatBytes(room.memoryFree ?? 0)} free.`
                        : ''
                    }`}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>

          <FormGroup label="Disk" isRequired fieldId="ceamls-sc-disk">
            <NumberInputWrapper
              id="ceamls-sc-disk"
              value={disk}
              // Not DISK_MIN: the input clamps each keystroke, so a typed
              // "12" became 102. The helper text says the range instead.
              min={1}
              max={DISK_MAX}
              increment={10}
              unit="GiB"
              widthChars={5}
              onChange={(v) => setDisk(v)}
              inputAriaLabel="Disk size in GiB"
              minusBtnAriaLabel="10 GiB less"
              plusBtnAriaLabel="10 GiB more"
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem variant={diskError ? 'error' : 'default'}>
                  {diskError ??
                    `Holds the system and your files: what you install stays over a stop and a start.${
                      room.diskFree !== undefined
                        ? ` The project has ${formatBytes(room.diskFree)} free.`
                        : ''
                    }`}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>

          <FormGroup label="GPU shares" fieldId="ceamls-sc-gpus">
            <NumberInputWrapper
              id="ceamls-sc-gpus"
              data-testid="ceamls-sc-gpus"
              value={gpus}
              min={0}
              max={Math.max(gpuRoom.total, 0)}
              widthChars={2}
              onChange={(v) => setGpus(v)}
              inputAriaLabel="Number of GPU shares"
              minusBtnAriaLabel="One GPU share less"
              plusBtnAriaLabel="One GPU share more"
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem variant={gpuError ? 'error' : 'default'}>
                  {gpuError ??
                    (gpuRoom.total === 0
                      ? 'The project has no GPU shares in its quota.'
                      : `The same shares a workbench takes: four on each NVIDIA H100. The driver is ready at the first login; there is nothing to install. The card's memory (94 GB) is shared with the other shares on it. The project has ${gpuRoom.free} of ${gpuRoom.total} free.`)}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>

          <Content component="p">
            Only you get SSH access, with the keys from your profile. The terminal on the
            machine&apos;s page needs no key and no password.
          </Content>

          {error && (
            <Alert variant="danger" isInline title="The machine was not created">
              {error}
            </Alert>
          )}

          <ActionGroup>
            <Button
              type="submit"
              variant="primary"
              isDisabled={busy || !valid}
              isLoading={busy}
              data-testid="ceamls-create-sc-submit"
            >
              Create system container
            </Button>
            <Button variant="link" onClick={() => navigate(containersRoute(ns))} isDisabled={busy}>
              Cancel
            </Button>
          </ActionGroup>
        </Form>
      </PageSection>
    </ApplicationsPage>
  );
};

export default CreateContainerPage;
