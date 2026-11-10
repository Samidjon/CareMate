import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CareMate",
    short_name: "CareMate",
    description: "Keksalar va nogironligi bo‘lgan insonlar uchun qulay tibbiy yordamchi.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f8f6",
    theme_color: "#087e70",
    lang: "uz",
    icons: [
      { src: "/brand/app-icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/app-icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/brand/app-icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
