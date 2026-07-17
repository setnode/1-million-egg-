import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "1 Million Egg",
  description: "Tap the egg. Earn eggs. Claim USDC.",
  other: {
    "fc:frame": JSON.stringify({
      version: "next",
      imageUrl: "https://1-million-egg.vercel.app/egg.png",
      button: {
        title: "Play 1 Million Egg",
        action: {
          type: "launch_frame",
          name: "1 Million Egg",
          url: "https://1-million-egg.vercel.app/"
        }
      }
    })
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.variable}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
