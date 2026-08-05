import type { Metadata } from "next";
import "@fontsource/inter/400.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aura",
  description: "A synesthesia simulator that turns melody into a luminous visual composition.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
