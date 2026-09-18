import type { Metadata, Viewport } from "next";
import { Fraunces, Noto_Sans_JP, Shippori_Mincho } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { siteConfig } from "@/config/site";
import "./globals.css";

const notoSans = Noto_Sans_JP({ variable: "--font-noto-sans", subsets: ["latin"], display: "swap", preload: false });
const shippori = Shippori_Mincho({
  variable: "--font-shippori",
  weight: ["500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
  preload: false,
});
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ??
      (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000"),
  ),
  title: { default: `${siteConfig.name} | ${siteConfig.tagline}`, template: `%s | ${siteConfig.name}` },
  description: siteConfig.description,
  keywords: [...siteConfig.keywords],
  applicationName: siteConfig.name,
  openGraph: {
    type: "website",
    locale: siteConfig.locale,
    siteName: siteConfig.name,
    title: siteConfig.name,
    description: siteConfig.description,
  },
  twitter: { card: "summary_large_image" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: siteConfig.themeColor.light },
    { media: "(prefers-color-scheme: dark)", color: siteConfig.themeColor.dark },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" suppressHydrationWarning data-scroll-behavior="smooth">
      <body className={`${notoSans.variable} ${shippori.variable} ${fraunces.variable} font-sans`}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          <NuqsAdapter>
            <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
          </NuqsAdapter>
          <Toaster richColors position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
