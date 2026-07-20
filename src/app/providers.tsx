'use client';

import '@rainbow-me/rainbowkit/styles.css';
import {
  getDefaultConfig,
  RainbowKitProvider,
  darkTheme,
} from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
import { base } from 'wagmi/chains';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { rpcTransports } from '@/config/rpc';
import { ReactNode } from 'react';
import { FrameProvider } from '@/components/providers/FrameProvider';

const config = getDefaultConfig({
  appName: '1 Million Egg',
  projectId: 'YOUR_PROJECT_ID', // Recommending WalletConnect project ID later
  chains: [base],
  transports: rpcTransports,
  ssr: true,
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme({
          accentColor: '#f59e0b',
          accentColorForeground: 'white',
          borderRadius: 'large',
          fontStack: 'system',
        })}>
          <FrameProvider>
            {children}
          </FrameProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
