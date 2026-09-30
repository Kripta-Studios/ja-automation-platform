import { describe, expect, it } from 'vitest';
import {
  formatTaxBasisPoints,
  taxProfileComponents,
} from '../../apps/portal/src/lib/portal/tax-profile-presentation';

describe('tax component metadata stays exact and individually ordered', () => {
  it.each([
    ['0', '0.00%'],
    ['1', '0.01%'],
    ['125', '1.25%'],
    ['00000125', '1.25%'],
    ['10000', '100.00%'],
    ['100000', '1000.00%'],
  ])('formats %s basis points as %s', (input, expected) => {
    expect(formatTaxBasisPoints(input)).toBe(expected);
  });
  it.each([undefined, null, 125, '-1', '1.25', '100001', '9007199254740993', '9'.repeat(1000)])(
    'does not guess an invalid or unsupported percentage from %s',
    (input) => expect(formatTaxBasisPoints(input)).toBeNull(),
  );
  it('preserves component order, names and each independent compound flag', () => {
    expect(
      taxProfileComponents(
        JSON.stringify([
          { name: 'Second named component', basisPoints: '125', compound: 1 },
          { name: 'First named component', basisPoints: '0', compound: 0 },
        ]),
      ),
    ).toEqual([
      { name: 'Second named component', basisPoints: '125', compound: true },
      { name: 'First named component', basisPoints: '0', compound: false },
    ]);
  });
  it('distinguishes an empty component list from unavailable metadata', () => {
    expect(taxProfileComponents('[]')).toEqual([]);
    for (const input of [
      null,
      '',
      '{}',
      'invalid',
      '[{"name":"Rate","basisPoints":null,"compound":0}]',
    ])
      expect(taxProfileComponents(input)).toBeNull();
  });
  it('does not present a partial list when one component is invalid', () => {
    expect(
      taxProfileComponents(
        '[{"name":"Known","basisPoints":"125","compound":0},{"name":"Unknown","basisPoints":"125","compound":2}]',
      ),
    ).toBeNull();
  });
});
