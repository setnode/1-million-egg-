import { NextRequest, NextResponse } from "next/server";
import { parseWebhookEvent, createVerifyAppKeyWithHub } from "@farcaster/frame-node";
import { db } from "@/services/db";
import { notificationToken } from "@/services/db/schema";
import { eq } from "drizzle-orm";

// Farcaster Hub ile imza doğrulaması (Ücretsiz public endpoint kullanıyoruz)
const verifier = createVerifyAppKeyWithHub("https://nemes.farcaster.xyz:2281");

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();

    let parsedEvent;
    try {
      // 1. Gelen webhook'un Farcaster imzası doğrulanıyor
      parsedEvent = await parseWebhookEvent(rawBody, verifier);
    } catch (err) {
      console.error("[Webhook] Signature verification failed:", err);
      // İmza geçersizse isteği 400 ile reddet (Sahtecilik koruması)
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
    }

    if (!db) {
      console.error("[Webhook] Database connection not found");
      return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }

    const { fid, event } = parsedEvent;
    const eventType = event.event;

    // 2. Event'e göre işlem yap (Idempotent UPSERT/DELETE)
    if (eventType === "frame_added" || eventType === "notifications_enabled") {
      // @ts-ignore - notificationDetails will be available in these events
      const notificationDetails = event.notificationDetails;
      
      if (notificationDetails) {
        // UPSERT mantığı: Kayıt yoksa oluştur, varsa güncelle
        await db.insert(notificationToken)
          .values({
            fid: fid,
            notificationUrl: notificationDetails.url,
            notificationToken: notificationDetails.token,
          })
          .onConflictDoUpdate({
            target: notificationToken.fid,
            set: {
              notificationUrl: notificationDetails.url,
              notificationToken: notificationDetails.token,
            },
          });
      }
    } else if (eventType === "frame_removed" || eventType === "notifications_disabled") {
      // Kullanıcı frame'i kaldırdıysa token'ı güvenli şekilde sil
      await db.delete(notificationToken).where(eq(notificationToken.fid, fid));
    }

    // 3. Her durumda başarılı dön (Tekrar tekrar gelse bile idempotent)
    return NextResponse.json({ success: true });
    
  } catch (err) {
    console.error("[Webhook] Processing error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
