import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Geist, Geist_Mono } from 'next/font/google';
import "./globals.css";
import { Providers } from "./providers";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistSans = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://1millionegg.xyz'),
  title: "1 Million Egg",
  description: "Tap the Egg. Earn Real USDC.",
  openGraph: {
    title: "1 Million Egg",
    description: "Tap the Egg. Earn Real USDC.",
    url: "https://1millionegg.xyz",
    siteName: "1 Million Egg",
    images: [
      {
        url: "https://1millionegg.xyz/og.png?v=2",
        width: 1200,
        height: 630,
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "1 Million Egg",
    description: "Tap the Egg. Earn Real USDC.",
    images: ["https://1millionegg.xyz/og.png?v=2"],
  },
  other: {
    "base:app_id": "6a5aa2e9a0fe5cd3aaa83293"
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${geistSans.variable} ${geistMono.variable}`}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
