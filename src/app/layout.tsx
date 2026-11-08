import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import "react-day-picker/style.css";
import { getSession } from "@/lib/session";
import Sidebar from "@/components/Sidebar";
import ToastProvider from "@/components/ToastProvider";

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();

  return (
    <html lang="en" className={inter.variable}>
      <body className="antialiased font-sans bg-background text-foreground">
        <ToastProvider />
        {session ? <Sidebar session={session} /> : null}
        <main
          className={
            session
              ? "pt-20 px-4 pb-12 md:pt-6 md:pb-8 md:pl-[17rem] md:pr-6 min-h-screen min-w-0"
              : "min-h-screen"
          }
        >
          {children}
        </main>
        {session ? (
          <footer className="hidden md:block md:pl-[17rem] py-3 text-center text-sm text-muted border-t border-black/5">
            © {new Date().getFullYear()} Ecomatrix Solutions. All Rights Reserved.
            {" | "}
            <Link href="/contact" className="text-accent hover:underline">
              Contact Us
            </Link>
          </footer>
        ) : null}
      </body>
    </html>
  );
}
