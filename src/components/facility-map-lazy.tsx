"use client";

import dynamic from "next/dynamic";

// Leaflet needs a browser, and most people using the text list never load it.
export const FacilityMapLazy = dynamic(() => import("./facility-map"), {
  ssr: false,
  loading: () => <div className="h-[45vh] min-h-[280px] w-full animate-pulse rounded-2xl bg-brand-pale" />,
});
