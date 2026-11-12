import { z } from 'zod';

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

const tokenResponseSchema = z.object({
  success: z.boolean().optional(),
  error: z.string().optional(),
  data: z
    .object({
      erc20s: z.array(tokenSchema),
    })
    .optional(),
});

export const httpFetchTokens = async (chainId: number, evmAddress: string) => {
  const res = await fetch(`/api/chain-info/${chainId}/${evmAddress}`);
  const body = tokenResponseSchema.parse(await res.json());
  if (!res.ok || body.success === false) {
    throw new Error(body.error || `Request failed with status ${res.status}`);
  }
  if (!body.data) throw new Error('Token API response is missing token data');
  return { ...body, data: body.data };
};

export type Tokens = ReadonlyArray<z.infer<typeof tokenSchema>>;
