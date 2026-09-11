import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://synesthesia.josephines.world"),
  title: "Synesthesia",
  description: "A synesthesia simulator that turns melody into a luminous visual composition.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    title: "Synesthesia",
    description: "A synesthesia simulator that turns melody into a luminous visual composition.",
    url: "/",
    siteName: "Synesthesia",
    type: "website",
    images: [
      {
        url: "/synesthesia-thumbnail.jpg",
        width: 1600,
        height: 990,
        alt: "Synesthesia transforming live music into a luminous visual composition",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Synesthesia",
    description: "A synesthesia simulator that turns melody into a luminous visual composition.",
    images: ["/synesthesia-thumbnail.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
