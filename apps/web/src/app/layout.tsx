import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#090b10" },
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
  ],
};

export const metadata: Metadata = {
  title: "Arpegia | AI-Powered Guitar Intelligence Platform",
  description:
    "AI Guitar Intelligence Platform - Real-time Tuner, Live Chord Recognition, Tablature Generation, Fingerstyle Arrangement Studio & Multi-Format Export",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Arpegia",
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#090b10] text-slate-100 selection:bg-amber-500/30 selection:text-amber-200 antialiased overscroll-y-none">
        {children}
      </body>
    </html>
  );
}
