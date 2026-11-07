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
  makePassword,
  sizeLabel,
  useImages,
  useSizes,
  useVms,
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

  const [name, setName] = React.useState('');
  const [touched, setTouched] = React.useState(false);
  const [imageName, setImageName] = React.useState<string>(images[0]?.name ?? 'ubuntu');
  const [sizeName, setSizeName] = React.useState<string>(DEFAULT_SIZE);
  const [disk, setDisk] = React.useState<number | undefined>(DISK_DEFAULT);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);

  const image: ImageState | undefined = images.find((i) => i.name === imageName);
  const size: Size | undefined =
    sizes.find((s) => s.name === sizeName) ??
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
  const diskError = disk === undefined ? `Between ${DISK_MIN} and ${DISK_MAX} GiB.` : undefined;
  // The form is complete when every part is present and valid.
  const complete = (): { image: ImageState; size: Size; disk: number } | undefined =>
    !nameError && image?.ready && size && disk !== undefined ? { image, size, disk } : undefined;
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
              value={size?.name ?? ''}
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
            </FormSelect>
            <FormHelperText>
              <HelperText id="ceamls-vm-size-help">
                <HelperTextItem>
                  {size?.description
                    ? plainDescription(size.description)
                    : 'The CPUs and memory the machine gets. They count against the project quota while it runs.'}
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
                    `The machine's own disk, kept while it is stopped. ${DISK_DEFAULT} GiB is enough for most work.`}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>

          <Content component="p">
            Your SSH keys from your profile are installed at the first boot. A password for the
            browser console is made for you and shown on the machine&apos;s page.
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
