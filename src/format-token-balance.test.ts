import { describe, expect, it } from 'vitest';
import { formatTokenBalance } from './format-token-balance';

describe('formatTokenBalance', () => {
  it('formats raw token units without relying on a price quote', () => {
    expect(formatTokenBalance('1234500', 6)).toBe('1.2345');
  });

  it('accepts hexadecimal balances from JSON-RPC responses', () => {
    expect(formatTokenBalance('0x1bc16d674ec80000', 18)).toBe('2');
  });
});
