/**
 * Shared head metadata for the arcade games so each game page gets its own
 * title, description, social preview and SoftwareApplication structured data
 * instead of falling back to the sitewide defaults.
 */
const BASE_URL = "https://dapai.lovable.app";

export function gameHead(opts: {
  /** Route path, e.g. "/games/2048". */
  path: string;
  /** Game name, e.g. "2048". */
  name: string;
  /** Search + social description (50-160 chars). */
  description: string;
}) {
  const title = `${opts.name} — Play free online | DAP Arcade`;
  const url = `${BASE_URL}${opts.path}`;
  return {
    meta: [
      { title },
      { name: "description", content: opts.description },
      { property: "og:title", content: title },
      { property: "og:description", content: opts.description },
      { property: "og:type", content: "website" },
      { property: "og:url", content: url },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: opts.description },
    ],
    links: [{ rel: "canonical", href: url }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: opts.name,
          applicationCategory: "GameApplication",
          operatingSystem: "Web browser",
          url,
          description: opts.description,
          isAccessibleForFree: true,
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          publisher: { "@type": "Organization", name: "DAP AI", url: BASE_URL },
        }),
      },
    ],
  };
}
