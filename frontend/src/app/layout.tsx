import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import Sidebar from "@/components/layout/Sidebar";
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
      <body className="flex min-h-screen overflow-hidden bg-slate-950 text-slate-50">
        <Sidebar />
        <main className="ml-64 flex min-h-screen flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-6">
            {children}
          </div>
        </main>
        <Toaster theme="dark" position="top-right" richColors />
      </body>
    </html>
  );
}