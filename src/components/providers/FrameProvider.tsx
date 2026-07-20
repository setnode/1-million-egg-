'use client';

import { useEffect, useState } from 'react';

export function FrameProvider({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        // Dynamically import sdk to prevent SSR window is not defined errors
        const { default: sdk } = await import('@farcaster/frame-sdk');
        
        setTimeout(() => {
          sdk.actions.ready();
          setIsReady(true);
        }, 100);
      } catch (e) {
        console.error("Failed to initialize Farcaster SDK:", e);
      }
    };
    init();
  }, []);

  return <>{children}</>;
}
