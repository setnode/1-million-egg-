import { fetchBatch, getTokensForBatch, updateStatus } from "./worker/queue";
import { sendNotification } from "./worker/sender";
import { calculateRetry, isRetryableError } from "./worker/retry";

const POLL_INTERVAL = 30000; // 30 seconds

async function processQueue() {
  try {
    const batch = await fetchBatch();
    
    if (batch.length === 0) {
      return; // Sessizce dön, log kirliliği yapma
    }

    console.log(`[Worker] Started processing batch. Total records: ${batch.length}`);

    // Batch içerisindeki kullanıcıların token bilgilerini al
    const addresses = batch.map(b => b.playerAddress);
    const tokens = await getTokensForBatch(addresses);
    
    // address -> { url, token } şeklinde hızlı arama haritası (Lookup Map) oluştur
    const tokenMap = new Map();
    for (const t of tokens) {
      tokenMap.set(t.address, { url: t.url, token: t.token });
    }

    let successCount = 0;
    let failCount = 0;
    let retryCountTracker = 0;

    for (const item of batch) {
      const target = tokenMap.get(item.playerAddress);
      
      // Eğer kullanıcının token'ı yoksa (Frame'i silmişse), işlemi doğrudan iptal et
      if (!target || !target.token || !target.url) {
        await updateStatus(item.id, 'cancelled', item.retryCount, item.sendAt);
        continue;
      }

      // 10 saniyelik timeout korumasıyla bildirimi gönder
      const result = await sendNotification(target.url, target.token, item.id);

      if (result.success) {
        // Başarılı olursa 'sent' olarak işaretle
        await updateStatus(item.id, 'sent', item.retryCount, item.sendAt);
        successCount++;
      } else {
        // Merkezi Retry hesaplayıcısını kullan
        if (isRetryableError(result.status)) {
          const retryDecision = calculateRetry(item.retryCount);
          if (retryDecision.shouldRetry) {
            // İleri bir tarihe ertele
            await updateStatus(item.id, 'pending', item.retryCount + 1, retryDecision.nextSendAt);
            retryCountTracker++;
          } else {
            // Maksimum deneme aşıldı
            await updateStatus(item.id, 'failed', item.retryCount, item.sendAt);
            failCount++;
          }
        } else {
          // Kalıcı hata (400, 401, 403, 404), bir daha deneme
          await updateStatus(item.id, 'failed', item.retryCount, item.sendAt);
          failCount++;
        }
      }
    }

    console.log(`[Worker] Batch Complete: ${successCount} Success, ${retryCountTracker} Retry, ${failCount} Failed`);

  } catch (err) {
    console.error("[Worker] Fatal processing error:", err);
  }
}

function startWorker() {
  console.log("[Worker] Service started. Polling every 30 seconds...");
  // Başlar başlamaz ilk batch'i çalıştır
  processQueue();
  // Ardından periyodik olarak devam et
  setInterval(processQueue, POLL_INTERVAL);
}

// Sadece dosya node tarafından doğrudan çalıştırıldığında başlat
if (require.main === module) {
  startWorker();
}
