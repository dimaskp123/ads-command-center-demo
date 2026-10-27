import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Client Ads Command Center",
  description: "Consolidated Meta Ads performance across all client ad accounts, in IDR — objective-aware KPIs, anomalies and creative diagnostics.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
