import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { OfflineBadge } from "@/components/OfflineBadge";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { AppToastProvider } from "@/components/ui/AppToast";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "墨问｜我的阅读世界",
  description: "本地优先的中文阅读、笔记与书架管理工具",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "墨问",
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
      className={`${geistSans.variable} ${geistMono.variable}`}
      lang="zh-CN"
      suppressHydrationWarning
    >
      <body className="antialiased" suppressHydrationWarning>
        <AppToastProvider>
          <ServiceWorkerRegistration />
          <OfflineBadge />
          {children}
        </AppToastProvider>
      </body>
    </html>
  );
}
