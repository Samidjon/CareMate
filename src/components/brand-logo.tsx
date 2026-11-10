import Image from "next/image";

/** The full logo, for pages where the brand should be prominent (sign-in, sign-up, dashboards). */
export function BrandLogo({ alt, size = 120 }: { alt: string; size?: number }) {
  return (
    <Image
      src="/brand/caremate-logo.svg"
      alt={alt}
      width={size}
      height={Math.round((size * 660) / 512)}
      className="mx-auto"
      priority
      unoptimized
    />
  );
}
