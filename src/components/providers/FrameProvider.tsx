'use client';

import { useEffect, useState } from 'react';
import sdk from '@farcaster/frame-sdk';

export function FrameProvider({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        // Ensure we're in a browser environment
        if (typeof window !== 'undefined') {
          setTimeout(() => {
            sdk.actions.ready();
            setIsReady(true);
          }, 100); // Small delay to ensure React has painted
        }
      } catch (e) {
        console.error("Failed to initialize Farcaster SDK:", e);
      }
    };
    init();
  }, []);

  return <>{children}</>;
}
