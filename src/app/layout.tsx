import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CareMate — sog‘liq va kundalik yordam",
  description: "Keksalar va nogironligi bo‘lgan insonlar uchun qulay tibbiy yordam platformasi.",
  applicationName: "CareMate",
};

export const viewport: Viewport = {
  themeColor: "#f5f8f7",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="uz">
      <body>{children}</body>
    </html>
  );
}
