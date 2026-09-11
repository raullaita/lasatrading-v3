import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import { Toaster } from "sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LasaTrading v3.0",
  description: "Plataforma de trading algorítmico personal",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-screen bg-slate-950 text-slate-50">
        <Sidebar />
        <main className="flex min-h-screen flex-1 flex-col">
          <Topbar />
          <div className="flex-1 overflow-y-auto">{children}</div>
        </main>
        <Toaster theme="dark" position="top-right" richColors />
      </body>
    </html>
  );
}