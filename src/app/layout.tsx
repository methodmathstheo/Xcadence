import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { ClockBar } from "@/components/ClockBar";
import { TickerBar } from "@/components/TickerBar";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Cadence — royalty exchange",
  description: "A live simulated exchange in emerging-artist royalty shares.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-ink">
        <Nav />
        <ClockBar />
        <TickerBar />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-line px-4 py-3 text-[11px] text-fg-mute">
          Virtual currency sandbox. Not a financial product.
        </footer>
      </body>
    </html>
  );
}
