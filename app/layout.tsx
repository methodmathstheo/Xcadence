import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import Reveal from "@/components/Reveal";

export const metadata: Metadata = {
  title: "Henry Hamilton · DJ & Producer",
  description: "Henry Hamilton. DJ and producer, East London and Essex. Bookings: henryhamiltonmusic@gmail.com",
  openGraph: {
    title: "Henry Hamilton · DJ & Producer",
    description: "DJ and producer, East London and Essex.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className="h-full">
      <body className="min-h-full flex flex-col">
        <Nav />
        <main className="flex-1">{children}</main>
        <Footer />
        <Reveal />
      </body>
    </html>
  );
}
