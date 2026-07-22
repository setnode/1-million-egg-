export async function sendNotification(url: string, token: string, notificationId: string): Promise<{ success: boolean, status: number | string }> {
  const controller = new AbortController();
  // 10 seconds timeout
  const timeoutId = setTimeout(() => controller.abort(), 10000); 

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        notificationId,
        title: "Daily Claim Ready!",
        body: "It's time to claim your daily egg and keep your streak alive!",
        targetUrl: "https://1millionegg.xyz",
        tokens: [token],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      return { success: true, status: response.status };
    } else {
      return { success: false, status: response.status };
    }
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return { success: false, status: 'timeout' };
    }
    return { success: false, status: 'network_error' };
  }
}
