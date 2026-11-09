import {
  ENV_CONFIGMAP,
  ENV_SECRET,
  exportLines,
  guessSecret,
  hasProjectEnv,
  nameError,
  normalizeName,
  parseDotEnv,
  parseMeta,
  shellQuote,
  withProjectEnv,
} from '#~/pages/ceamls/projectEnv/envUtils';

describe('names', () => {
  it('accepts shell names and refuses the rest', () => {
    expect(nameError('HF_TOKEN')).toBeUndefined();
    expect(nameError('_A1')).toBeUndefined();
    expect(nameError('')).toBeDefined();
    expect(nameError('1ABC')).toBeDefined();
    expect(nameError('hf_token')).toBeDefined();
    expect(nameError('A-B')).toBeDefined();
  });
  it('normalizes what is typed', () => {
    expect(normalizeName('hf token')).toBe('HF_TOKEN');
    expect(normalizeName('wandb.entity')).toBe('WANDB_ENTITY');
  });
  it('guesses secrets from the name', () => {
    expect(guessSecret('HF_TOKEN')).toBe(true);
    expect(guessSecret('WANDB_API_KEY')).toBe(true);
    expect(guessSecret('PGPASSWORD')).toBe(true);
    expect(guessSecret('DATA_ROOT')).toBe(false);
    expect(guessSecret('PGHOST')).toBe(false);
  });
});

describe('parseDotEnv', () => {
  it('reads plain, quoted and exported lines, comments and blanks', () => {
    const { vars, bad } = parseDotEnv(
      [
        '# comment',
        '',
        'A=1',
        'export B="two words"',
        "C='it''s'",
        'D=value # trailing comment',
        'E=',
        'F=a=b',
      ].join('\n'),
    );
    expect(bad).toEqual([]);
    expect(vars).toEqual([
      { name: 'A', value: '1' },
      { name: 'B', value: 'two words' },
      { name: 'C', value: "it''s" },
      { name: 'D', value: 'value' },
      { name: 'E', value: '' },
      { name: 'F', value: 'a=b' },
    ]);
  });
  it('reports lines that are not variables and keeps the last value', () => {
    const { vars, bad } = parseDotEnv('A=1\nnot a line\nA=2\n1X=3');
    expect(bad).toEqual(['not a line', '1X=3']);
    expect(vars).toEqual([{ name: 'A', value: '2' }]);
  });
  it('accepts CRLF', () => {
    expect(parseDotEnv('A=1\r\nB=2\r\n').vars).toHaveLength(2);
  });
});

describe('envFrom', () => {
  const other = { secretRef: { name: 'aws-connection-x' } };
  it('adds the two entries once and removes them', () => {
    const on = withProjectEnv([other], true);
    expect(on).toHaveLength(3);
    expect(on[0]).toEqual(other);
    expect(on.some((e) => e.secretRef?.name === ENV_SECRET)).toBe(true);
    expect(on.some((e) => e.configMapRef?.name === ENV_CONFIGMAP)).toBe(true);
    expect(hasProjectEnv(on)).toBe(true);
    expect(withProjectEnv(on, true)).toHaveLength(3);
    const off = withProjectEnv(on, false);
    expect(off).toEqual([other]);
    expect(hasProjectEnv(off)).toBe(false);
    expect(hasProjectEnv(undefined)).toBe(false);
  });
});

describe('meta', () => {
  it('parses the annotation and ignores junk', () => {
    expect(parseMeta(undefined)).toEqual({});
    expect(parseMeta('not json')).toEqual({});
    expect(parseMeta('[1]')).toEqual({});
    expect(parseMeta('{"A":{"by":"me","at":"2026-11-09T00:00:00Z"},"B":3}')).toEqual({
      A: { by: 'me', at: '2026-11-09T00:00:00Z' },
    });
  });
});

describe('shell output', () => {
  it('quotes for a single-quoted shell string', () => {
    expect(shellQuote('plain')).toBe("'plain'");
    expect(shellQuote("it's")).toBe("'it'\\''s'");
    expect(exportLines([{ name: 'A', value: 'x y', secret: false }])).toBe("export A='x y'");
  });
});
