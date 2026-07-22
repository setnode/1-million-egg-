const MAX_RETRIES = 5;

export function calculateRetry(retryCount: number): { shouldRetry: boolean, nextSendAt: number } {
  if (retryCount >= MAX_RETRIES) {
    return { shouldRetry: false, nextSendAt: 0 };
  }
  const now = Math.floor(Date.now() / 1000);
  const backoffMinutes = Math.pow(2, retryCount); // 1, 2, 4, 8, 16
  return { 
    shouldRetry: true, 
    nextSendAt: now + (backoffMinutes * 60) 
  };
}

export function isRetryableError(status: number | string): boolean {
  if (status === 'timeout' || status === 'network_error') return true;
  if (typeof status === 'number') {
    return status === 429 || status >= 500;
  }
  return false;
}
