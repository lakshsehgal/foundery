import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Foundery", template: "%s · Foundery" },
  description: "Neuroid's founders dashboard — clients, costs, invoices and what they add up to.",
};

/**
 * Self-hosted at build time: no render-blocking request and no layout shift,
 * and the app still builds on a machine with no network.
 */
const dmSans = localFont({
  variable: "--font-dm-sans",
  display: "swap",
  src: [
    { path: "../../public/fonts/DMSans-Variable.ttf", weight: "100 900", style: "normal" },
    { path: "../../public/fonts/DMSans-Italic-Variable.ttf", weight: "100 900", style: "italic" },
  ],
});

export const viewport: Viewport = {
  themeColor: "#f6f7fb",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={dmSans.variable} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('foundery-theme');if(t)document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "var(--color-surface-2)",
              border: "1px solid var(--color-line)",
              color: "var(--color-ink)",
            },
          }}
        />
      </body>
    </html>
  );
}
