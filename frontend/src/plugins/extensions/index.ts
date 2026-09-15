import type { Extension } from '@openshift/dynamic-plugin-sdk';
import ceamlsExtensions from './ceamls';
import hardwareProfileExtensions from './hardware-profiles';
import navigationExtensions from './navigation';
import routeExtensions from './routes';

const extensions: Extension[] = [
  ...navigationExtensions,
  ...hardwareProfileExtensions,
  ...routeExtensions,
  ...ceamlsExtensions,
];

export default extensions;
