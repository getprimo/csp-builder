const PRIMO_BASE = "https://www.getprimo.com";

export const PRIMO_HOME = PRIMO_BASE;

export function primoUrl(content: string, path = "/"): string {
  const url = new URL(path, PRIMO_BASE);
  url.searchParams.set("utm_source", "csp-builder");
  url.searchParams.set("utm_medium", "tool");
  url.searchParams.set("utm_campaign", "csp_builder");
  url.searchParams.set("utm_content", content);
  return url.toString();
}
