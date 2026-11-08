// CEAMLS: the one-page form that makes a virtual machine: a name, one of
// four images, a size, a disk. Nothing else to decide.
import * as React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ActionGroup,
  Alert,
  Breadcrumb,
  BreadcrumbItem,
  Button,
  Content,
  Form,
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  Flex,
  FlexItem,
  FormSelectOptionGroup,
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
import { vmRoute, vmsRoute } from '#~/pages/ceamls/routes';
import {
  NAME_RE,
  createVm,
  errorMessage,
  formatBytes,
  memoryBytesOf,
  useRoom,
  makePassword,
  CUSTOM_CPU_MAX,
  CUSTOM_MEMORY_MAX,
  CUSTOM_SIZE,
  customSize,
  isCustom,
  sizeLabel,
  useImages,
  useSizes,
  useVms,
  PROFILE_DOC_URL,
  useMyKeyInProject,
} from './api';
import type { ImageState, Size } from './api';

const DISK_MIN = 10;
const DISK_MAX = 1000;
const DISK_DEFAULT = 30;
const DEFAULT_SIZE = 'u1.medium';

/** The size description without the markdown bold the console wants. */
const plainDescription = (s: string): string => s.replace(/\*\*/g, '');

const CreateVmPage: React.FC = () => {
  const { currentProject } = React.useContext(ProjectDetailsContext);
  const ns = currentProject.metadata.name;
  const navigate = useNavigate();
  const [images, imagesLoaded] = useImages();
  const [sizes, sizesLoaded] = useSizes(ns);
  const [vms] = useVms(ns);
  const room = useRoom(ns);
  const hasKey = useMyKeyInProject(ns);

  const [name, setName] = React.useState('');
  const [touched, setTouched] = React.useState(false);
  const [imageName, setImageName] = React.useState<string>(images[0]?.name ?? 'ubuntu');
  const [sizeName, setSizeName] = React.useState<string>(DEFAULT_SIZE);
  const [customCpu, setCustomCpu] = React.useState<number | undefined>(2);
  const [customMemory, setCustomMemory] = React.useState<number | undefined>(8);
  const [disk, setDisk] = React.useState<number | undefined>(DISK_DEFAULT);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);

  const image: ImageState | undefined = images.find((i) => i.name === imageName);
  const size: Size | undefined =
    sizeName === CUSTOM_SIZE
      ? customCpu !== undefined && customMemory !== undefined
        ? customSize(customCpu, customMemory)
        : undefined
      : sizes.find((s) => s.name === sizeName) ??
        sizes.find((s) => s.name === DEFAULT_SIZE) ??
        sizes.at(0);

  const taken = vms.some((vm) => vm.metadata?.name === name);
  let nameError: string | undefined;
  if (!name) {
    nameError = 'Give the machine a name.';
  } else if (name.length > 63 || !NAME_RE.test(name)) {
    nameError = 'Lowercase letters, digits and dashes, at most 63 characters.';
  } else if (taken) {
    nameError = 'A machine with this name exists in the project.';
  }
  const diskBytes = (disk ?? 0) * 1024 ** 3;
  let diskError: string | undefined;
  if (disk === undefined) {
    diskError = `Between ${DISK_MIN} and ${DISK_MAX} GiB.`;
  } else if (room.diskFree !== undefined && diskBytes > room.diskFree) {
    diskError =
      room.diskFree === 0
        ? 'The project has no disk space free. Delete a volume or a machine you do not need, or ask for more space.'
        : `The project has ${formatBytes(
            room.diskFree,
          )} of disk space free. Pick a smaller disk, or delete a volume or a machine you do not need.`;
  }
  let sizeError: string | undefined;
  if (sizeName === CUSTOM_SIZE && !size) {
    sizeError = `Between 1 and ${CUSTOM_CPU_MAX} CPUs, and between 1 and ${CUSTOM_MEMORY_MAX} GiB of memory.`;
  } else if (size && room.cpuFree !== undefined && size.cpu > room.cpuFree) {
    sizeError = `The project has ${room.cpuFree} ${room.cpuFree === 1 ? 'CPU' : 'CPUs'} free of ${
      room.cpuTotal ?? 0
    }. Pick a smaller size, or stop a workbench or a machine.`;
  } else if (
    size &&
    room.memoryFree !== undefined &&
    memoryBytesOf(size.memory) > room.memoryFree
  ) {
    sizeError = `The project has ${formatBytes(room.memoryFree)} of memory free of ${formatBytes(
      room.memoryTotal ?? 0,
    )}. Pick a smaller size, or stop a workbench or a machine.`;
  }
  // The form is complete when every part is present and valid.
  const complete = (): { image: ImageState; size: Size; disk: number } | undefined =>
    !nameError && !diskError && !sizeError && image?.ready && size && disk !== undefined
      ? { image, size, disk }
      : undefined;
  const ready = !busy && complete() !== undefined;

  const groups = React.useMemo(() => {
    const byClass = new Map<string, Size[]>();
    sizes.forEach((s) => {
      byClass.set(s.className, [...(byClass.get(s.className) ?? []), s]);
    });
    return Array.from(byClass.entries());
  }, [sizes]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const filled = complete();
    if (busy || !filled) {
      setTouched(true);
      return;
    }
    setBusy(true);
    setError(undefined);
    createVm(ns, { name, ...filled, password: makePassword() })
      .then(() => navigate(vmRoute(ns, name)))
      .catch((err: unknown) => {
        setError(errorMessage(err));
        setBusy(false);
      });
  };

  return (
    <ApplicationsPage
      title="Create virtual machine"
      description={`A Linux machine in ${getDisplayNameFromK8sResource(
        currentProject,
      )}. It starts as soon as it is made.`}
      breadcrumb={
        <Breadcrumb>
          <BreadcrumbItem render={() => <Link to={vmsRoute(ns)}>Virtual machines</Link>} />
          <BreadcrumbItem isActive>Create virtual machine</BreadcrumbItem>
        </Breadcrumb>
      }
      loaded={imagesLoaded && sizesLoaded}
      empty={false}
    >
      <PageSection hasBodyWrapper={false} isWidthLimited>
        <Form onSubmit={submit} maxWidth="640px" data-testid="ceamls-create-vm">
          <FormGroup label="Name" isRequired fieldId="ceamls-vm-name">
            <TextInput
              id="ceamls-vm-name"
              value={name}
              onChange={(_e, v) => setName(v.toLowerCase().replace(/\s+/g, '-'))}
              onBlur={() => setTouched(true)}
              validated={touched && nameError ? 'error' : 'default'}
              aria-describedby="ceamls-vm-name-help"
              isRequired
              autoFocus
            />
            <FormHelperText>
              <HelperText id="ceamls-vm-name-help">
                <HelperTextItem variant={touched && nameError ? 'error' : 'default'}>
                  {touched && nameError
                    ? nameError
                    : 'Lowercase letters, digits and dashes. It is the host name in SSH commands.'}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>

          <FormGroup label="Image" isRequired role="radiogroup" fieldId="ceamls-vm-image">
            {images.map((img) => (
              <Radio
                key={img.name}
                id={`ceamls-vm-image-${img.name}`}
                name="ceamls-vm-image"
                label={img.title}
                description={`${img.note} Signs in as ${img.user}.${
                  img.ready ? '' : ' Not ready on the cluster yet.'
                }`}
                isChecked={imageName === img.name}
                isDisabled={!img.ready}
                onChange={() => setImageName(img.name)}
              />
            ))}
          </FormGroup>

          <FormGroup label="Size" isRequired fieldId="ceamls-vm-size">
            <FormSelect
              id="ceamls-vm-size"
              value={sizeName === CUSTOM_SIZE ? CUSTOM_SIZE : size?.name ?? ''}
              onChange={(_e, v) => setSizeName(v)}
              aria-describedby="ceamls-vm-size-help"
            >
              {groups.map(([className, list]) => (
                <FormSelectOptionGroup key={className} label={className}>
                  {list.map((s) => (
                    <FormSelectOption key={s.name} value={s.name} label={sizeLabel(s)} />
                  ))}
                </FormSelectOptionGroup>
              ))}
              <FormSelectOptionGroup label="Custom">
                <FormSelectOption value={CUSTOM_SIZE} label="Custom · your own CPUs and memory" />
              </FormSelectOptionGroup>
            </FormSelect>
            {sizeName === CUSTOM_SIZE && (
              <Flex
                gap={{ default: 'gapLg' }}
                className="pf-v6-u-mt-sm"
                data-testid="ceamls-vm-custom-size"
              >
                <FlexItem>
                  <NumberInputWrapper
                    id="ceamls-vm-custom-cpu"
                    value={customCpu}
                    min={1}
                    max={CUSTOM_CPU_MAX}
                    unit={customCpu === 1 ? 'CPU' : 'CPUs'}
                    widthChars={4}
                    onChange={(v) => setCustomCpu(v)}
                    inputAriaLabel="CPUs"
                    minusBtnAriaLabel="One CPU less"
                    plusBtnAriaLabel="One CPU more"
                  />
                </FlexItem>
                <FlexItem>
                  <NumberInputWrapper
                    id="ceamls-vm-custom-memory"
                    value={customMemory}
                    min={1}
                    max={CUSTOM_MEMORY_MAX}
                    unit="GiB of memory"
                    widthChars={5}
                    onChange={(v) => setCustomMemory(v)}
                    inputAriaLabel="Memory in GiB"
                    minusBtnAriaLabel="1 GiB less"
                    plusBtnAriaLabel="1 GiB more"
                  />
                </FlexItem>
              </Flex>
            )}
            <FormHelperText>
              <HelperText id="ceamls-vm-size-help">
                <HelperTextItem variant={sizeError ? 'error' : 'default'}>
                  {sizeError ??
                    (size?.description
                      ? `${plainDescription(size.description)}${
                          isCustom(size) && room.cpuFree !== undefined
                            ? ` The project has ${room.cpuFree} ${
                                room.cpuFree === 1 ? 'CPU' : 'CPUs'
                              } and ${formatBytes(room.memoryFree ?? 0)} free.`
                            : ''
                        }`
                      : 'The CPUs and memory the machine gets. They count against the project quota while it runs.')}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>

          <FormGroup label="Disk" isRequired fieldId="ceamls-vm-disk">
            <NumberInputWrapper
              id="ceamls-vm-disk"
              value={disk}
              min={DISK_MIN}
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
                    `The machine's own disk, kept while it is stopped. ${DISK_DEFAULT} GiB is enough for most work.${
                      room.diskFree !== undefined
                        ? ` The project has ${formatBytes(room.diskFree)} free.`
                        : ''
                    }`}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>

          <Content component="p">
            The SSH keys from your profile go in at the first boot, and a key you add later reaches
            the machine within a minute. A password for the browser console is made for you and
            shown on the machine&apos;s page.
          </Content>

          {hasKey === false && (
            <Alert
              variant="info"
              isInline
              title="Your profile has no SSH key"
              data-testid="ceamls-no-ssh-key"
            >
              Run <code>ceamls ssh-key setup</code> on your computer, or add the key in My Account.
              The machine gets it within a minute, also after it has started.{' '}
              <a href={PROFILE_DOC_URL} target="_blank" rel="noopener noreferrer">
                How to add a key
              </a>
            </Alert>
          )}

          {error && (
            <Alert variant="danger" isInline title="The machine was not created">
              {error}
            </Alert>
          )}

          <ActionGroup>
            <Button
              type="submit"
              variant="primary"
              isDisabled={!ready}
              isLoading={busy}
              data-testid="ceamls-create-vm-submit"
            >
              Create virtual machine
            </Button>
            <Button variant="link" onClick={() => navigate(vmsRoute(ns))} isDisabled={busy}>
              Cancel
            </Button>
          </ActionGroup>
        </Form>
      </PageSection>
    </ApplicationsPage>
  );
};

export default CreateVmPage;
