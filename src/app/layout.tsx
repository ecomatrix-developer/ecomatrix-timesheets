import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "react-day-picker/style.css";
import { getSession } from "@/lib/session";
import Sidebar from "@/components/Sidebar";
import ToastProvider from "@/components/ToastProvider";
import AIAssistantWidget from "@/components/AIAssistantWidget";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Timesheet | Eco Matrix Solutions",
  description: "Employee timesheet & project tracking — v2",
  icons: {
    icon: [{ url: "/favicon.png", type: "image/png", sizes: "512x512" }],
    shortcut: "/favicon.png",
    apple: "/favicon.png",
  },
};

// Explicit, rather than relying on a framework default — guarantees every
// page actually renders at the device's real width (not desktop-width
// scaled down) on phones/tablets, which every responsive Tailwind
// breakpoint in this app depends on.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();

  // Abeer, 2026-11-23 (speed pass): this used to fetch both notification
  // counts here with 2 live DB queries, server-side, on every single page
  // this layout wraps — which in Next 15 means EVERY navigation re-runs
  // them, not just the first load. Pure waste: NotificationBell already
  // polls /api/notifications/count itself (now immediately on mount, plus
  // every 60s) completely independently of navigation, so these counts
  // were being computed twice for no benefit. Seeding 0/0 here just means
  // the bell is correct within one fast client fetch after mount instead
  // of instantly on first paint — worth it to stop paying 2 DB round
  // trips on every click.
  const notificationCounts = { contactUnread: 0, leavePending: 0 };

  return (
    <html lang="en" className={inter.variable}>
      <body className="antialiased font-sans bg-background text-foreground">
        <ToastProvider />
        {session ? <Sidebar session={session} notificationCounts={notificationCounts} /> : null}
        <main
          className={
            session
              ? "pt-20 px-4 pb-12 md:pt-6 md:pb-8 md:pl-[17rem] md:pr-6 min-h-screen min-w-0"
              : "min-h-screen"
          }
        >
          {children}
        </main>
        {session?.role === "admin" ? <AIAssistantWidget /> : null}
      </body>
    </html>
  );
}
