import { createPublicClient, erc20Abi, http } from 'viem';
import { bsc } from 'viem/chains';
import { z } from 'zod';

// Well-known BNB Smart Chain token addresses.
// Used as a pure-client fallback when the BSCScan proxy is unavailable.
// All balance checks use viem multicall against the public BSC RPC — zero CORS issues.
const TOP_BSC_TOKENS: `0x${string}`[] = [
  '0x55d398326f99059fF775485246999027B3197955', // USDT
  '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', // USDC
  '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', // BUSD
  '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', // ETH (Binance-Peg)
  '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', // BTCB (Binance-Peg BTC)
  '0x1AF3F329e8BE154074D8769D1FFA4ee058B1DBc3', // DAI
  '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81CE82', // CAKE
  '0xBB4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB
  '0xCC42724C6683B7E57334c4E856f4c9965Ed682bD', // MATIC (Binance-Peg)
  '0x7083609fCE4d1d8dc0C979AAb8c869Ea2C873402', // DOT (Binance-Peg)
  '0x3EE2200Efb3400fAbB9AaCF31297cBDD1d435D47', // ADA (Binance-Peg)
  '0xF8A0BF9cF54Bb92F17374d9e9A321E6a111a51bD', // LINK
  '0x4338665CBB7B2485A8855A139b75D5e34ab0DB94', // LTC (Binance-Peg)
  '0xbA2aE424d960c26247Dd6c32edC70B295C744C43', // DOGE
  '0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBe', // XRP (Binance-Peg)
  '0x2859e4544C4bB03966803b044A93563bd2D0DD4d', // SHIB
  '0xFb5B838b6cfEEdc2873aB27866079AC55363D37E', // FLOKI
  '0x4b0F1812e5Df2A09796481Ff14017e6005508003', // TWT (Trust Wallet Token)
  '0xbF5140A22578168FD562DCcF235E5D43A02ce9B1', // UNI (Binance-Peg)
  '0xFb6115445Bff7b52FeB98650C87f44907E58f802', // AAVE
  '0x111111111117dC0aa78b770fA6A738034120C302', // 1INCH
  '0xCF6BB5389c92Bdda8a3747Ddb454cB7a64626C63', // XVS
  '0x0D8Ce2A99Bb6e3B7Db580eD848240e4a0F9aE153', // FIL (Binance-Peg)
  '0x352Cb5E19b12FC216548a2677bD0fce83BAe434b', // BTT
  '0x965F527D9159dCe6288a2219DB51fc6Eef120dD1', // BSW
  '0x8F0528cE5eF7B51152A59745bEfDD91D97091d2f', // ALPACA
  '0xa2B726B1145A4773F68593CF171187d8EBe4d495', // INJ (Binance-Peg)
  '0x9C65AB58d8d978Db963e63f2bfB7121627e3a739', // MDX
  '0xA4080f1778e69467E905B8d6F72f6e441f9e9484', // SXP
  '0x9678E42ceBEb63F23197D726B29b1CB20d0064E5', // CELO (Binance-Peg)
  '0x52CE071Bd9b1C4B00A0b92D298c512478CaD67e8', // COMP (Binance-Peg)
  '0x25d887Ce7a35172C62FeBFD67a1856F20FaEbb00', // PEPE
  '0xc9849E6fdB743d08fAeE3E34dd2D1bc69EA11a51', // BUNNY
  '0x9Ac983826058b8a9C7Aa1C9171441191232E8404', // SNX (Binance-Peg)
  '0x4BD17003473389A42DAF6a0a729f6Fdb328BbBd4', // VAI
  '0xd4CB328A82bDf5f03eB737f37Fa6B370aEf3e888', // CREAM
  '0x1Ba42e5193dfA8B03D15dd1B86a3113bbBEF8Eeb', // ZEC (Binance-Peg)
  '0xC9882dEF23bc42D53895b8361D0b1EDC7570Bc6A', // FDUSD
  '0x14016E85a25aeb13065688cAFB43044C2ef86784', // TUSD
];

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
   * Fetches BNB Smart Chain token balances.
   * Step 1: scan on-chain Transfer logs to discover every token the user has
   *         received in the last 20 000 blocks (~16 h). No API key needed —
   *         all calls are JSON-RPC against the public BSC RPC (CORS-safe).
   * Step 2: merge log-discovered addresses with the hardcoded top-token list.
   * Step 3: batch-check balances and metadata via multicall3.
   */
  private async fetchTokensFromBSC(
    evmAddress: string,
    blacklistAddresses: string[],
  ): Promise<FetchTokensResult> {
    const bscClient = createPublicClient({
      chain: bsc,
      transport: http('https://bsc-dataseed.bnbchain.org'),
    });
    const multicallAddr =
      '0xcA11bde05977b3631167028862bE2a173976CA11' as `0x${string}`;
    const userAddr = evmAddress as `0x${string}`;

    // 1. Discover tokens from Transfer logs (finds non-popular tokens like renBTC)
    const logDiscovered: `0x${string}`[] = await (async () => {
      try {
        const ERC20_TRANSFER =
          '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' as `0x${string}`;
        // addresses in log topics are padded to 32 bytes
        const paddedAddr =
          `0x${'0'.repeat(24)}${userAddr.slice(2).toLowerCase()}` as `0x${string}`;

        const currentBlock = await Promise.race([
          bscClient.getBlockNumber(),
          new Promise<bigint>((_, rej) =>
            setTimeout(() => rej(new Error('timeout')), 4000),
          ),
        ]);

        const fromBlock = (currentBlock as bigint) - BigInt(20000);

        const logs = await Promise.race([
          bscClient.getLogs({
            fromBlock,
            toBlock: 'latest' as const,
            topics: [ERC20_TRANSFER, null, paddedAddr],
          } as Parameters<typeof bscClient.getLogs>[0]),
          new Promise<never>((_, rej) =>
            setTimeout(() => rej(new Error('timeout')), 6000),
          ),
        ]);

        return Array.from(
          new Set(
            (logs as Array<{ address: string }>).map((l) =>
              l.address.toLowerCase(),
            ),
          ),
        ) as `0x${string}`[];
      } catch (_) {
        return [];
      }
    })();

    // 2. Merge with hardcoded list (dedup)
    const merged = [...TOP_BSC_TOKENS];
    for (const addr of logDiscovered) {
      if (!merged.some((t) => t.toLowerCase() === addr.toLowerCase())) {
        merged.push(addr as `0x${string}`);
      }
    }

    const unique = merged.filter(
      (addr) =>
        !blacklistAddresses.some((b) => b.toLowerCase() === addr.toLowerCase()),
    );

    if (!unique.length) return { erc20s: [], nfts: [] };

    // 3. Batch balanceOf via multicall3
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

    // 4. Batch name/symbol/decimals for tokens with balance
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
