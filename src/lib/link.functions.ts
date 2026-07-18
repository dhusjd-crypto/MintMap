import { createServerFn } from "@tanstack/react-start";

// Server-side fetch of a URL's Open Graph / title metadata so link cards can
// show a title + thumbnail (like a Keep bookmark). Runs on the server to dodge
// browser CORS. Best-effort: returns whatever it can parse, never throws.

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

export const fetchLinkMeta = createServerFn({ method: "POST" })
  .inputValidator((data: { url: string }) => {
    if (!data.url) throw new Error("url gerekli");
    return data;
  })
  .handler(async ({ data }) => {
    let url = data.url.trim();
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    const empty = { url, title: undefined, description: undefined, image: undefined, siteName: undefined };
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; MintMapBot/1.0; +https://mintmap.app)",
          Accept: "text/html,application/xhtml+xml",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return empty;
      const html = (await res.text()).slice(0, 250_000);
      const pick = (re: RegExp): string | undefined => {
        const m = html.match(re);
        return m ? decodeEntities(m[1]) : undefined;
      };
      const meta = (prop: string): string | undefined =>
        pick(
          new RegExp(
            `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`,
            "i",
          ),
        ) ??
        pick(
          new RegExp(
            `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`,
            "i",
          ),
        );

      let image = meta("og:image") ?? meta("twitter:image");
      if (image && image.startsWith("/")) {
        try {
          image = new URL(image, url).href;
        } catch {
          /* leave as-is */
        }
      }
      return {
        url,
        title: meta("og:title") ?? meta("twitter:title") ?? pick(/<title[^>]*>([^<]*)<\/title>/i),
        description: meta("og:description") ?? meta("twitter:description") ?? meta("description"),
        image,
        siteName: meta("og:site_name"),
      };
    } catch {
      return empty;
    }
  });
