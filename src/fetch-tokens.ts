import { z } from 'zod';
import { AlchemyClient, NormalizedToken } from './alchemy-client';
import { blacklistAddresses } from './token-lists';

const tokenSchema = z.object({
  contract_decimals: z.number(),
  contract_name: z.string(),
  contract_ticker_symbol: z.string(),
  contract_address: z.string(),
  supports_erc: z.tuple([z.literal('erc20')]),
  logo_url: z.string(),
  last_transferred_at: z.string(),
  native_token: z.boolean(),
  type: z.string(),
  balance: z.string(),
  balance_24h: z.string(),
  quote_rate: z.number(),
  quote_rate_24h: z.number(),
  quote: z.number(),
  quote_24h: z.number(),
  nft_data: z.null(),
});

export const httpFetchTokens = async (chainId: number, evmAddress: string) => {
  const apiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
  if (!apiKey) {
    throw new Error('Alchemy API key is not configured');
  }
  const client = new AlchemyClient(apiKey, chainId);
  const data = await client.fetchTokens(
    chainId,
    evmAddress,
    blacklistAddresses,
  );
  return { success: true, data };
};

export type Tokens = ReadonlyArray<NormalizedToken>;
