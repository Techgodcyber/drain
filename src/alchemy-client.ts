import { z } from 'zod';

/**
 * Alchemy API client for fetching ERC-20 token balances across multiple chains
 */

// Chain ID to Alchemy network name mapping
const CHAIN_ID_TO_ALCHEMY_NETWORK: Record<number, string> = {
  1: 'eth-mainnet',
  10: 'opt-mainnet',
  56: 'bnb-mainnet',
  100: 'gnosismainnet',
  137: 'polygon-mainnet',
  8453: 'base-mainnet',
  42161: 'arb-mainnet',
  43114: 'avax-mainnet',
  59144: 'linea-mainnet',
} as const;

// Zod schema for Alchemy token balance response
const AlchemyTokenSchema = z.object({
  contractAddress: z.string(),
  tokenBalance: z.string(),
});

// Zod schema for Alchemy token metadata response
const AlchemyMetadataSchema = z.object({
  name: z.string().nullable().optional(),
  symbol: z.string().nullable().optional(),
  decimals: z.number().nullable().optional(),
  logo: z.string().url().nullable().optional(),
});

const AlchemyRpcErrorSchema = z.object({
  message: z.string(),
});

const AlchemyBalancesResponseSchema = z.object({
  error: AlchemyRpcErrorSchema.optional(),
  result: z
    .object({
      tokenBalances: z.array(AlchemyTokenSchema).optional(),
    })
    .optional(),
});

const AlchemyMetadataResponseSchema = z.object({
  error: AlchemyRpcErrorSchema.optional(),
  result: AlchemyMetadataSchema.optional(),
});

// Normalized token type that matches the existing codebase structure
export interface NormalizedToken {
  contract_decimals: number;
  contract_name: string;
  contract_ticker_symbol: string;
  contract_address: string;
  supports_erc: ['erc20'];
  logo_url: string;
  last_transferred_at: string;
  native_token: boolean;
  type: 'cryptocurrency' | 'stablecoin';
  balance: string;
  balance_24h: string;
  quote_rate: number;
  quote_rate_24h: number;
  quote: number;
  quote_24h: number;
  nft_data: null;
}

export interface FetchTokensResult {
  erc20s: ReadonlyArray<NormalizedToken>;
  nfts: ReadonlyArray<never>;
}

export class AlchemyClient {
  private readonly apiKey: string;
  private network: string;
  private readonly baseUrl: string;

  constructor(apiKey: string, chainId: number = 1) {
    if (!apiKey) {
      throw new Error('Alchemy API key is required');
    }
    this.apiKey = apiKey;
    this.network = this.getNetworkName(chainId);
    this.baseUrl = `https://${this.network}.g.alchemy.com/v2`;
  }

  /**
   * Fetches ERC-20 token balances for a given address on a specific chain
   */
  async fetchTokens(
    chainId: number,
    evmAddress: string,
    blacklistAddresses: string[] = [],
  ): Promise<FetchTokensResult> {
    this.network = this.getNetworkName(chainId);

    // Get token balances
    const balances = await this.getTokenBalances(evmAddress);

    // Filter and normalize tokens
    const normalizedTokens: NormalizedToken[] = [];

    for (const balance of balances) {
      // Skip blacklisted addresses
      if (
        blacklistAddresses.some(
          (addr) =>
            addr.toLowerCase() === balance.contractAddress.toLowerCase(),
        )
      ) {
        continue;
      }

      // Skip zero balances
      if (balance.tokenBalance === '0') {
        continue;
      }

      // Get metadata for token
      try {
        const metadata = await this.getTokenMetadata(balance.contractAddress);

        // Skip if no decimals (likely invalid token)
        if (metadata.decimals === null || metadata.decimals === undefined) {
          continue;
        }

        const normalizedToken: NormalizedToken = {
          contract_decimals: metadata.decimals,
          contract_name: metadata.name || 'Unknown Token',
          contract_ticker_symbol: metadata.symbol || 'UNKNOWN',
          contract_address: balance.contractAddress,
          supports_erc: ['erc20'] as ['erc20'],
          logo_url: metadata.logo || '',
          last_transferred_at: new Date().toISOString(),
          native_token: false,
          type: this.isStablecoin(metadata.symbol)
            ? 'stablecoin'
            : 'cryptocurrency',
          balance: balance.tokenBalance,
          balance_24h: balance.tokenBalance, // Alchemy doesn't provide historical data
          quote_rate: 0, // Would need additional price API
          quote_rate_24h: 0,
          quote: 0,
          quote_24h: 0,
          nft_data: null,
        };

        normalizedTokens.push(normalizedToken);
      } catch (e) {
        // Skip tokens we can't fetch metadata for
        console.warn(
          `Failed to fetch metadata for token ${balance.contractAddress}:`,
          e,
        );
        continue;
      }
    }

    return {
      erc20s: normalizedTokens,
      nfts: [],
    };
  }

  /**
   * Gets token balances for an address
   */
  private async getTokenBalances(
    evmAddress: string,
  ): Promise<Array<{ contractAddress: string; tokenBalance: string }>> {
    const response = await fetch(`${this.baseUrl}/${this.apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'alchemy_getTokenBalances',
        params: [evmAddress, 'erc20'],
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Alchemy API request failed: ${response.status} ${response.statusText}`,
      );
    }

    const data = AlchemyBalancesResponseSchema.parse(await response.json());

    if (data.error) {
      throw new Error(`Alchemy API error: ${data.error.message}`);
    }

    const result = data.result?.tokenBalances || [];
    return result.map((token: any) => ({
      contractAddress: token.contractAddress,
      tokenBalance: token.tokenBalance,
    }));
  }

  /**
   * Gets token metadata using Alchemy's tokenMetadata RPC method
   */
  private async getTokenMetadata(tokenAddress: string): Promise<{
    name: string | null;
    symbol: string | null;
    decimals: number | null;
    logo: string | null;
  }> {
    const response = await fetch(`${this.baseUrl}/${this.apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'alchemy_getTokenMetadata',
        params: [tokenAddress],
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Alchemy metadata request failed: ${response.status} ${response.statusText}`,
      );
    }

    const data = AlchemyMetadataResponseSchema.parse(await response.json());

    if (data.error) {
      throw new Error(`Alchemy API error: ${data.error.message}`);
    }

    const result = data.result || {};
    return {
      name: result.name || null,
      symbol: result.symbol || null,
      decimals: result.decimals || null,
      logo: result.logo || null,
    };
  }

  /**
   * Maps chain ID to Alchemy network name
   */
  private getNetworkName(chainId: number): string {
    const networkName = CHAIN_ID_TO_ALCHEMY_NETWORK[chainId];
    if (!networkName) {
      throw new Error(
        `Chain ID ${chainId} is not supported. Supported chains: ${Object.keys(CHAIN_ID_TO_ALCHEMY_NETWORK).join(', ')}`,
      );
    }
    return networkName;
  }

  /**
   * Check if token is a stablecoin based on symbol
   */
  private isStablecoin(symbol: string | null | undefined): boolean {
    const stablecoinSymbols = [
      'USDT',
      'USDC',
      'DAI',
      'BUSD',
      'UST',
      'TUSD',
      'USDP',
      'USDD',
      'GUSD',
      'FRAX',
    ];
    return stablecoinSymbols.includes(symbol?.toUpperCase() || '');
  }

  /**
   * Gets the list of supported chain IDs
   */
  static getSupportedChainIds(): number[] {
    return Object.keys(CHAIN_ID_TO_ALCHEMY_NETWORK).map(Number);
  }
}
