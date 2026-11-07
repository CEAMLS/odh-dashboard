// CEAMLS: number and key helpers for the Buckets pages.
const UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];

export const formatBytes = (bytes: number | undefined | null): string => {
  if (bytes === undefined || bytes === null || Number.isNaN(bytes)) {
    return '-';
  }
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < UNITS.length - 1) {
    value /= 1024;
    i += 1;
  }
  const digits = i === 0 || value >= 100 ? 0 : 1;
  return `${value.toFixed(digits)} ${UNITS[i]}`;
};

export const formatCount = (n: number | undefined | null, complete = true): string => {
  if (n === undefined || n === null) {
    return '-';
  }
  const text = n.toLocaleString();
  return complete ? text : `${text}+`;
};

/** The last part of a key or prefix, without the trailing slash. */
export const baseName = (key: string): string => {
  const trimmed = key.endsWith('/') ? key.slice(0, -1) : key;
  const i = trimmed.lastIndexOf('/');
  return i >= 0 ? trimmed.slice(i + 1) : trimmed;
};

/** "a/b/" -> [["a", "a/"], ["b", "a/b/"]] */
export const prefixCrumbs = (prefix: string): [string, string][] => {
  const out: [string, string][] = [];
  let acc = '';
  for (const part of prefix.split('/').filter(Boolean)) {
    acc += `${part}/`;
    out.push([part, acc]);
  }
  return out;
};
