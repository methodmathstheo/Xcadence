import type { Metadata } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { ClockBar } from "@/components/ClockBar";
import { TickerBar } from "@/components/TickerBar";
import { isDemo } from "@/lib/sim/names";

// Space Grotesk for chrome and headings, JetBrains Mono for every figure.
// The mono is the load-bearing choice here: this interface is mostly columns
// of numbers updating in place, and JetBrains Mono's tabular figures and
// unambiguous 0/O and 1/l keep a live table readable at a glance.
const display = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});
const mono = JetBrains_Mono({
  variable: "--font-mono-ui",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "xcadence — royalty exchange",
  description: "A live simulated exchange in artist royalty shares.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-ink">
        <Nav />
        <ClockBar />
        <TickerBar />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-line px-4 py-3 text-xs text-fg-mute">
          Virtual currency sandbox. Not a financial product.
        </footer>
      </body>
    </html>
  );
}
