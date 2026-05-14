import '@rainbow-me/rainbowkit/styles.css'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  RainbowKitProvider,
  darkTheme,
  getDefaultConfig,
} from '@rainbow-me/rainbowkit'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { WagmiProvider } from 'wagmi'
import { sepolia } from 'wagmi/chains'

import App from './App'
import './index.css'

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? ''

if (!projectId) {
  console.warn('Missing VITE_WALLETCONNECT_PROJECT_ID in frontend/.env.local')
}

const config = getDefaultConfig({
  appName: 'Scan4Me',
  projectId,
  chains: [sepolia],
  ssr: false,
})

const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme()}>
          <App />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
)