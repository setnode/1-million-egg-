import { http, fallback } from 'viem';
import { base, baseSepolia } from 'viem/chains';

// Fetch the RPC URL from environment variables. 
const envUrl = process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL || "";

// Extract the API key securely (matches anything after /v2/)
const match = envUrl.match(/\/v2\/(.+)$/);
const alchemyKey = match ? match[1] : undefined;

const alchemyMainnetUrl = alchemyKey ? `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}` : undefined;
const alchemySepoliaUrl = alchemyKey ? `https://base-sepolia.g.alchemy.com/v2/${alchemyKey}` : undefined;

// Export boolean to let backend know if we can use large chunks
export const isAlchemyActive = !!alchemyKey;

const basePublicRpc = process.env.NEXT_PUBLIC_ALCHEMY_URL || "https://mainnet.base.org"; // Removed hardcoded reliance, depends on env
const baseSepoliaPublicRpc = "https://sepolia.base.org";

// Centralized transports configuration for Wagmi
export const rpcTransports = {
  [base.id]: alchemyMainnetUrl 
    ? http(alchemyMainnetUrl, { 
        retryCount: 2, 
        timeout: 10000,
        batch: true // Enable batching to reduce redundant requests
      })
    : http(basePublicRpc, { retryCount: 2, timeout: 10000, batch: true }),
  
  [baseSepolia.id]: alchemySepoliaUrl 
    ? fallback([
        http(alchemySepoliaUrl, { 
          retryCount: 2, 
          timeout: 10000,
          batch: true 
        }),
        http(baseSepoliaPublicRpc, { 
          retryCount: 2, 
          timeout: 10000,
          batch: true
        })
      ])
    : http(baseSepoliaPublicRpc, { retryCount: 2, timeout: 10000, batch: true }),
};

// Helper for backend Viem clients (like API routes)
export const getViemTransport = (chainId: number) => {
  return rpcTransports[chainId as keyof typeof rpcTransports] || http();
};
