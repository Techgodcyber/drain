import { createPublicClient, erc20Abi, http } from 'viem';
import { bsc } from 'viem/chains';
import { z } from 'zod';

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

// Ankr blockchain names (fallback when Alchemy fails)
const CHAIN_ID_TO_ANKR_BLOCKCHAIN: Record<number, string> = {
  1: 'eth',
  10: 'optimism',
  56: 'bsc',
  100: 'gnosis',
  137: 'polygon',
  8453: 'base',
  42161: 'arbitrum',
  43114: 'avalanche',
  59144: 'linea',
};

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
   * Fetches ERC-20 token balances via Ankr public API (fallback for chains Alchemy can't serve)
   */
  private async fetchTokensFromAnkr(
    chainId: number,
    evmAddress: string,
    blacklistAddresses: string[],
  ): Promise<FetchTokensResult> {
    const blockchain = CHAIN_ID_TO_ANKR_BLOCKCHAIN[chainId];
    if (!blockchain) throw new Error(`Ankr: chain ${chainId} not supported`);

    const response = await fetch('https://rpc.ankr.com/multichain/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'ankr_getAccountBalance',
        params: {
          walletAddress: evmAddress,
          blockchain: [blockchain],
          onlyWhitelisted: false,
          pageSize: 100,
        },
        id: 1,
      }),
    });

    if (!response.ok)
      throw new Error(`Ankr request failed: ${response.status}`);
    const data = await response.json();
    if (data.error) throw new Error(`Ankr error: ${data.error.message}`);

    const assets: any[] = data.result?.assets ?? [];
    const tokens: NormalizedToken[] = assets
      .filter(
        (a) =>
          a.tokenType === 'ERC20' &&
          a.contractAddress &&
          a.balanceRawInteger !== '0',
      )
      .filter(
        (a) =>
          !blacklistAddresses.some(
            (b) => b.toLowerCase() === a.contractAddress.toLowerCase(),
          ),
      )
      .map((a) => ({
        contract_decimals: parseInt(a.tokenDecimals) || 18,
        contract_name: a.tokenName || 'Unknown Token',
        contract_ticker_symbol: a.tokenSymbol || 'UNKNOWN',
        contract_address: a.contractAddress,
        supports_erc: ['erc20'] as ['erc20'],
        logo_url: a.thumbnail || '',
        last_transferred_at: new Date().toISOString(),
        native_token: false,
        type: this.isStablecoin(a.tokenSymbol)
          ? 'stablecoin'
          : 'cryptocurrency',
        balance: a.balanceRawInteger || '0',
        balance_24h: a.balanceRawInteger || '0',
        quote_rate: parseFloat(a.tokenPrice) || 0,
        quote_rate_24h: 0,
        quote: parseFloat(a.balanceUsd) || 0,
        quote_24h: 0,
        nft_data: null,
      }));

    return { erc20s: tokens, nfts: [] };
  }

  /**
   * Fetches BNB Smart Chain token balances using BSCScan tx history + public BSC RPC.
   * No API key required. Used as final fallback when Alchemy and Ankr both fail.
   */
  private async fetchTokensFromBSC(
    evmAddress: string,
    blacklistAddresses: string[],
  ): Promise<FetchTokensResult> {
    // 1. Get token contract list via our Cloudflare Pages Function proxy
    // (BSCScan has no CORS headers — calling it directly from the browser fails)
    const resp = await fetch(`/api/bsc-tokens?address=${evmAddress}`);
    if (!resp.ok) throw new Error(`BSC token lookup failed: ${resp.status}`);

    const data = await resp.json();
    if (data.status !== '1') return { erc20s: [], nfts: [] };

    const txs: Array<{ contractAddress: string }> = data.result ?? [];
    const unique = Array.from(
      new Set(txs.map((t) => t.contractAddress.toLowerCase())),
    )
      .filter(
        (addr) => !blacklistAddresses.some((b) => b.toLowerCase() === addr),
      )
      .map((a) => a as `0x${string}`);

    if (!unique.length) return { erc20s: [], nfts: [] };

    // 2. Batch balanceOf calls via multicall3 on public BSC RPC
    const bscClient = createPublicClient({
      chain: bsc,
      transport: http('https://bsc-dataseed.bnbchain.org'),
    });
    const multicallAddr =
      '0xcA11bde05977b3631167028862bE2a173976CA11' as `0x${string}`;
    const userAddr = evmAddress as `0x${string}`;

    const balResults = await bscClient.multicall({
      contracts: unique.map((address) => ({
        address,
        abi: erc20Abi,
        functionName: 'balanceOf' as const,
        args: [userAddr] as [`0x${string}`],
      })),
      multicallAddress: multicallAddr,
      allowFailure: true,
    });

    const withBalance = unique.filter((_, i) => {
      const r = balResults[i];
      return r.status === 'success' && (r.result as bigint) > BigInt(0);
    });

    if (!withBalance.length) return { erc20s: [], nfts: [] };

    // 3. Batch name/symbol/decimals for tokens with balance
    const metaResults = await bscClient.multicall({
      contracts: withBalance.flatMap((address) => [
        { address, abi: erc20Abi, functionName: 'decimals' as const },
        { address, abi: erc20Abi, functionName: 'symbol' as const },
        { address, abi: erc20Abi, functionName: 'name' as const },
      ]),
      multicallAddress: multicallAddr,
      allowFailure: true,
    });

    const tokens: NormalizedToken[] = withBalance.map((address, i) => {
      const balIdx = unique.indexOf(address);
      const balance = String(
        balResults[balIdx].status === 'success'
          ? (balResults[balIdx].result as bigint)
          : BigInt(0),
      );
      const decimals =
        metaResults[i * 3].status === 'success'
          ? Number(metaResults[i * 3].result as number)
          : 18;
      const symbol =
        metaResults[i * 3 + 1].status === 'success'
          ? String(metaResults[i * 3 + 1].result)
          : 'UNKNOWN';
      const name =
        metaResults[i * 3 + 2].status === 'success'
          ? String(metaResults[i * 3 + 2].result)
          : 'Unknown Token';

      return {
        contract_decimals: decimals || 18,
        contract_name: name,
        contract_ticker_symbol: symbol,
        contract_address: address,
        supports_erc: ['erc20'] as ['erc20'],
        logo_url: '',
        last_transferred_at: new Date().toISOString(),
        native_token: false,
        type: this.isStablecoin(symbol) ? 'stablecoin' : 'cryptocurrency',
        balance,
        balance_24h: balance,
        quote_rate: 0,
        quote_rate_24h: 0,
        quote: 0,
        quote_24h: 0,
        nft_data: null,
      };
    });

    return { erc20s: tokens, nfts: [] };
  }

  /**
   * Fetches ERC-20 token balances for a given address on a specific chain
   */
  async fetchTokens(
    chainId: number,
    evmAddress: string,
    blacklistAddresses: string[] = [],
  ): Promise<FetchTokensResult> {
    try {
      this.network = this.getNetworkName(chainId);

      const balances = await this.getTokenBalances(evmAddress);
      const normalizedTokens: NormalizedToken[] = [];

      for (const balance of balances) {
        if (
          blacklistAddresses.some(
            (addr) =>
              addr.toLowerCase() === balance.contractAddress.toLowerCase(),
          )
        ) {
          continue;
        }

        if (balance.tokenBalance === '0') {
          continue;
        }

        try {
          const metadata = await this.getTokenMetadata(balance.contractAddress);

          if (metadata.decimals === null || metadata.decimals === undefined) {
            continue;
          }

          normalizedTokens.push({
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
            balance_24h: balance.tokenBalance,
            quote_rate: 0,
            quote_rate_24h: 0,
            quote: 0,
            quote_24h: 0,
            nft_data: null,
          });
        } catch (e) {
          console.warn(
            `Failed to fetch metadata for token ${balance.contractAddress}:`,
            e,
          );
        }
      }

      return { erc20s: normalizedTokens, nfts: [] };
    } catch (alchemyError) {
      console.warn(
        `Alchemy failed for chain ${chainId}, trying Ankr:`,
        alchemyError,
      );
      try {
        return await this.fetchTokensFromAnkr(
          chainId,
          evmAddress,
          blacklistAddresses,
        );
      } catch (ankrError) {
        console.warn(
          `Ankr failed for chain ${chainId}, trying BSC public RPC:`,
          ankrError,
        );
        if (chainId === 56) {
          return this.fetchTokensFromBSC(evmAddress, blacklistAddresses);
        }
        throw new Error(
          `Failed to fetch tokens for chain ${chainId}: ${(ankrError as Error).message}`,
        );
      }
    }
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
