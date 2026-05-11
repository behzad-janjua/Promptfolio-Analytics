import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PriceProvider } from "@/contexts/PriceContext";
import { PortfolioProvider } from "@/contexts/PortfolioContext";
import { NotificationPermissionBanner, InAppAlertStack } from "@/app/components/NotificationCenter";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Promptfolio Analytics",
  description: "Real-time portfolio analytics with live price simulation and AI signals",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <PriceProvider>
          <PortfolioProvider>
            <NotificationPermissionBanner />
            {children}
            <InAppAlertStack />
          </PortfolioProvider>
        </PriceProvider>
      </body>
    </html>
  );
}
