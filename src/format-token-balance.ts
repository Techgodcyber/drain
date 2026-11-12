import { formatUnits } from 'viem';

export const formatTokenBalance = (balance: string, decimals: number) =>
  formatUnits(BigInt(balance), decimals);
