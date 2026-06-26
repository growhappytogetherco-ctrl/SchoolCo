import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import { Providers } from "@/providers";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets:  ["latin"],
  display:  "swap",
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets:  ["latin"],
  display:  "swap",
  weight:   ["400", "500", "600", "700"],
  style:    ["normal", "italic"],
});

export const metadata: Metadata = {
  title: {
    default:  "SchoolCo",
    template: "%s | SchoolCo",
  },
  description:
    "Every Child Known. Every Family Connected. Every Leader Developed.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "https://schoolco.app"
  ),
  openGraph: {
    type:        "website",
    locale:      "en_US",
    siteName:    "SchoolCo",
    title:       "SchoolCo",
    description: "Every Child Known. Every Family Connected. Every Leader Developed.",
  },
  robots: {
    index:  false, // Private platform — never index
    follow: false,
  },
};

export const viewport: Viewport = {
  width:        "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor:   "#046264",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${playfair.variable}`}>
      <body className="min-h-screen bg-sc-cream antialiased">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
