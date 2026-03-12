import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "qt4oh-studio | Qt for OpenHarmony Unit Test Platform",
  description: "qt4oh-studio — Automated unit test execution and reporting for Qt on OpenHarmony",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="light" style={{ height: "100%" }}>
      <body
        className={`${geistSans.variable} ${geistMono.variable}`}
        style={{ minHeight: "100%", height: "100%", margin: 0, padding: 0, overflowX: "hidden", overflowY: "auto" }}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
