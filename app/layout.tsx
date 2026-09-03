import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Synesthesia",
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
      <body>
        {children}
      </body>
    </html>
  );
}
