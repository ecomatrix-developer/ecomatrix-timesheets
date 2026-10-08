"use client";

import { Toaster } from "react-hot-toast";

/**
 * Mounted once in the root layout. Replaces every browser-native
 * alert()/confirm() result message in the app with a themed toast —
 * styled to match the app's purple/glass design system rather than
 * react-hot-toast's plain default look.
 */
export default function ToastProvider() {
  return (
    <Toaster
      position="top-right"
      gutter={10}
      toastOptions={{
        duration: 3500,
        style: {
          background: "#ffffff",
          color: "#111827",
          fontSize: "0.875rem",
          padding: "0.75rem 1rem",
          borderRadius: "0.75rem",
          boxShadow:
            "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)",
          border: "1px solid #e5e7eb",
        },
        success: {
          iconTheme: { primary: "#667eea", secondary: "#ffffff" },
          style: { borderLeft: "4px solid #667eea" },
        },
        error: {
          iconTheme: { primary: "#dc2626", secondary: "#ffffff" },
          style: { borderLeft: "4px solid #dc2626" },
        },
      }}
    />
  );
}
