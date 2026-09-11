import type { Metadata } from "next";
import "./globals.css";

const description = "What does sound look like? Inspired by synesthesia, this work turns live audio into an ever-changing visual experience. Play the piano, make a sound, or let the piece listen to music! Each sound leaves a different visual impression, creating a space where listening becomes a way of seeing. DJ the visuals <3";

export const metadata: Metadata = {
  metadataBase: new URL("https://synesthesia.josephines.world"),
  title: "Synesthesia",
  description,
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    title: "Synesthesia",
    description,
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
    description,
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
