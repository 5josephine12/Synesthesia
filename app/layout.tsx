import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aura",
  description: "A synesthesia simulator that turns a word and a melody into a downloadable aura.",
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
