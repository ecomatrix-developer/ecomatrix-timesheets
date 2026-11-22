import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "react-day-picker/style.css";
import { getSession, isSuperAdminOnly } from "@/lib/session";
import { getUnreadContactSubmissionsCount, getPendingLeaveRequestsCount } from "@/lib/data";
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

  // Only Super Admin ever sees the notification bell now (2026-11-22:
  // "remove inbox from admins" — both counts it shows are Super-Admin-
  // only), so only they pay for these two extra queries. Guarded the same
  // way every other v3.0 feature is — a missing table (pre-migration)
  // degrades to 0 instead of 500ing every single page in the app.
  let notificationCounts = { contactUnread: 0, leavePending: 0 };
  if (session && isSuperAdminOnly(session)) {
    try {
      const [contactUnread, leavePending] = await Promise.all([
        getUnreadContactSubmissionsCount(),
        getPendingLeaveRequestsCount(),
      ]);
      notificationCounts = { contactUnread, leavePending };
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code !== "PGRST205") throw err;
    }
  }

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
