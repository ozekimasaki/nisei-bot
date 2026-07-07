import type { RandomSource } from "./random.js";
import { withMaybeOpener } from "./utterance.js";

export type WikiArticle = {
  title: string;
  extract: string;
  url: string;
};

export type WikiClientOptions = {
  userAgent: string;
  timeoutMs?: number;
};

const API_BASE = "https://ja.wikipedia.org/w/api.php";

export async function searchWikipedia(query: string, options: WikiClientOptions): Promise<WikiArticle | null> {
  const titles = await fetchSearchTitles(query, options);
  if (titles.length === 0) return null;
  const title = titles[0]!;
  const extract = await fetchExtract(title, options);
  if (!extract) return null;
  return {
    title,
    extract,
    url: `https://ja.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`
  };
}

export async function searchWikipediaAt(
  query: string,
  index: number,
  options: WikiClientOptions
): Promise<WikiArticle | null> {
  const titles = await fetchSearchTitles(query, options);
  if (titles.length === 0) return null;
  const safeIndex = Math.min(Math.max(index, 0), titles.length - 1);
  const title = titles[safeIndex]!;
  const extract = await fetchExtract(title, options);
  if (!extract) return null;
  return {
    title,
    extract,
    url: `https://ja.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`
  };
}

export function pickSearchIndex(random: RandomSource, resultCount: number, wrongResultRate: number): number {
  if (resultCount <= 1) return 0;
  if (random.chance(wrongResultRate)) {
    return random.int(1, Math.min(resultCount - 1, 4));
  }
  return 0;
}

export function truncateExtract(text: string, maxLength = 80): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength)}…`;
}

export function mangleWikiReply(
  random: RandomSource,
  subject: string,
  article: WikiArticle,
  options: { includeUrl: boolean }
): string {
  const snippet = truncateExtract(article.extract);
  const body = random.pick([
    `しらべた。${subject}は${snippet}`,
    `ウィキにある。${subject}は${snippet}`,
    `${subject}、${snippet}`
  ]);
  const suffix = random.pick(["", " たぶん", " えらい", " へへ"]);
  const urlPart = options.includeUrl ? `\n${article.url}` : "";
  return withMaybeOpener(random, `${body}${suffix}${urlPart}`);
}

export async function fetchSearchTitlesForQuery(query: string, options: WikiClientOptions): Promise<string[]> {
  return fetchSearchTitles(query, options);
}

async function fetchSearchTitles(query: string, options: WikiClientOptions): Promise<string[]> {
  const params = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: query,
    srlimit: "5",
    format: "json",
    origin: "*"
  });
  const data = await wikiFetch(`${API_BASE}?${params}`, options);
  const items = (data as WikiSearchResponse).query?.search ?? [];
  return items.map((item) => item.title).filter(Boolean);
}

async function fetchExtract(title: string, options: WikiClientOptions): Promise<string | null> {
  const params = new URLSearchParams({
    action: "query",
    prop: "extracts",
    exintro: "1",
    explaintext: "1",
    titles: title,
    format: "json",
    origin: "*"
  });
  const data = await wikiFetch(`${API_BASE}?${params}`, options);
  const pages = (data as WikiExtractResponse).query?.pages;
  if (!pages) return null;
  const page = Object.values(pages)[0];
  if (!page || page.missing !== undefined) return null;
  return page.extract?.trim() || null;
}

async function wikiFetch(url: string, options: WikiClientOptions): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 5000);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": options.userAgent },
      signal: controller.signal
    });
    if (!response.ok) return {};
    return await response.json();
  } catch {
    return {};
  } finally {
    clearTimeout(timeout);
  }
}

type WikiSearchResponse = {
  query?: { search?: Array<{ title: string }> };
};

type WikiExtractResponse = {
  query?: { pages?: Record<string, { extract?: string; missing?: string }> };
};
