import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import type { GeminiThinkingLevel } from "./config.js";

export type AiStatusProviderId = "openai" | "google" | "claude" | "xai";

export type ProviderIncident = {
  title: string;
  status?: string;
  impact?: string;
  latestUpdate?: string;
};

export type ProviderComponentIssue = {
  name: string;
  status: string;
};

export type ProviderStatus =
  | {
      provider: AiStatusProviderId;
      displayName: string;
      sourceUrl: string;
      ok: true;
      overall: string;
      indicator?: string;
      degradedComponents: ProviderComponentIssue[];
      incidents: ProviderIncident[];
    }
  | {
      provider: AiStatusProviderId;
      displayName: string;
      sourceUrl: string;
      ok: false;
      error: "fetch_failed";
    };

export type AiStatusFetchOptions = {
  timeoutMs?: number;
  userAgent?: string;
  now?: Date;
  fetchImpl?: typeof fetch;
};

export type GenerateStatusContentFn = (prompt: string) => Promise<string>;

export type ExplainAiStatusOptions = {
  apiKey: string;
  model: string;
  thinkingLevel: GeminiThinkingLevel;
  status: ProviderStatus;
  generateContent?: GenerateStatusContentFn;
};

const PROVIDER_META: Record<
  AiStatusProviderId,
  { displayName: string; sourceUrl: string }
> = {
  openai: {
    displayName: "OpenAI",
    sourceUrl: "https://status.openai.com/"
  },
  claude: {
    displayName: "Claude",
    sourceUrl: "https://status.claude.com/"
  },
  google: {
    displayName: "Google (Gemini / AI Studio)",
    sourceUrl: "https://aistudio.google.com/status"
  },
  xai: {
    displayName: "xAI",
    sourceUrl: "https://status.x.ai/"
  }
};

const STATUSPAGE_URLS: Record<"openai" | "claude", string> = {
  openai: "https://status.openai.com/api/v2/summary.json",
  claude: "https://status.claude.com/api/v2/summary.json"
};

const GOOGLE_INCIDENTS_URL = "https://status.cloud.google.com/incidents.json";
const XAI_FEED_URL = "https://status.x.ai/feed.xml";

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_USER_AGENT =
  "nisei-bot/0.1 (chisei-oss; https://github.com/chisei-oss/chisei-oss)";
const XAI_RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;
const SOFT_OUTPUT_LIMIT = 1800;

const GOOGLE_KEYWORD_RE = /Gemini|Generative AI|AI Studio|Vertex AI/iu;

const ACTIVE_INCIDENT_STATUSES = new Set([
  "investigating",
  "identified",
  "monitoring",
  "scheduled"
]);

export function isAiStatusProviderId(value: string): value is AiStatusProviderId {
  return value === "openai" || value === "google" || value === "claude" || value === "xai";
}

export function providerDisplayName(id: AiStatusProviderId): string {
  return PROVIDER_META[id].displayName;
}

export async function fetchProviderStatus(
  id: AiStatusProviderId,
  options: AiStatusFetchOptions = {}
): Promise<ProviderStatus> {
  const meta = PROVIDER_META[id];
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  const now = options.now ?? new Date();
  const fetchImpl = options.fetchImpl ?? fetch;

  try {
    switch (id) {
      case "openai":
      case "claude": {
        const json = await fetchJson(STATUSPAGE_URLS[id], {
          timeoutMs,
          userAgent,
          fetchImpl
        });
        return parseStatuspageSummary(id, json);
      }
      case "google": {
        const json = await fetchJson(GOOGLE_INCIDENTS_URL, {
          timeoutMs,
          userAgent,
          fetchImpl
        });
        return parseGoogleIncidents(json, now);
      }
      case "xai": {
        const xml = await fetchText(XAI_FEED_URL, {
          timeoutMs,
          userAgent,
          fetchImpl
        });
        return parseXaiRss(xml, now, XAI_RECENT_WINDOW_MS);
      }
      default: {
        const _exhaustive: never = id;
        throw new Error(`Unhandled provider: ${String(_exhaustive)}`);
      }
    }
  } catch {
    return {
      provider: id,
      displayName: meta.displayName,
      sourceUrl: meta.sourceUrl,
      ok: false,
      error: "fetch_failed"
    };
  }
}

export function parseStatuspageSummary(
  provider: "openai" | "claude",
  raw: unknown
): ProviderStatus {
  const meta = PROVIDER_META[provider];
  if (!raw || typeof raw !== "object") {
    throw new Error("invalid_statuspage_json");
  }

  const data = raw as StatuspageSummary;
  const overall = data.status?.description?.trim() || "Unknown";
  const indicator = data.status?.indicator?.trim() || undefined;

  const degradedComponents = (data.components ?? [])
    .filter((component) => {
      const status = component.status?.trim().toLowerCase();
      return Boolean(status) && status !== "operational";
    })
    .map((component) => ({
      name: component.name?.trim() || "unknown",
      status: component.status?.trim() || "unknown"
    }));

  const incidents = (data.incidents ?? [])
    .filter((incident) => {
      const status = incident.status?.trim().toLowerCase() ?? "";
      return ACTIVE_INCIDENT_STATUSES.has(status);
    })
    .map((incident) => {
      const updates = incident.incident_updates ?? [];
      const latest = updates[0];
      return {
        title: incident.name?.trim() || "untitled incident",
        status: incident.status?.trim(),
        impact: incident.impact?.trim(),
        latestUpdate: latest?.body?.trim()
      };
    });

  return {
    provider,
    displayName: meta.displayName,
    sourceUrl: meta.sourceUrl,
    ok: true,
    overall,
    indicator,
    degradedComponents,
    incidents
  };
}

export function parseGoogleIncidents(raw: unknown, now: Date = new Date()): ProviderStatus {
  const meta = PROVIDER_META.google;
  if (!Array.isArray(raw)) {
    throw new Error("invalid_google_incidents_json");
  }

  const incidents: ProviderIncident[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const incident = item as GoogleIncident;
    if (incident.end) continue;
    if (!isGoogleGeminiRelated(incident)) continue;

    const latest =
      incident.most_recent_update?.text?.trim() ||
      incident.updates?.[0]?.text?.trim() ||
      undefined;

    incidents.push({
      title: incident.external_desc?.trim() || "untitled incident",
      status: incident.most_recent_update?.status?.trim() || incident.status_impact?.trim(),
      impact: incident.severity?.trim(),
      latestUpdate: truncateText(latest, 400)
    });
  }

  const overall =
    incidents.length === 0
      ? "No active Gemini / AI Studio related incidents on Google Cloud status"
      : `${incidents.length} active Gemini / AI Studio related incident(s)`;

  void now;

  return {
    provider: "google",
    displayName: meta.displayName,
    sourceUrl: meta.sourceUrl,
    ok: true,
    overall,
    indicator: incidents.length === 0 ? "none" : "minor",
    degradedComponents: [],
    incidents
  };
}

export function parseXaiRss(
  xml: string,
  now: Date = new Date(),
  windowMs: number = XAI_RECENT_WINDOW_MS
): ProviderStatus {
  const meta = PROVIDER_META.xai;
  const items = extractRssItems(xml);
  const cutoff = now.getTime() - windowMs;

  const incidents: ProviderIncident[] = [];
  for (const item of items) {
    const pubMs = Date.parse(item.pubDate);
    if (!Number.isFinite(pubMs) || pubMs < cutoff) continue;
    const title = item.title.trim();
    if (!title) continue;
    if (/resolved/iu.test(title)) continue;

    incidents.push({
      title,
      latestUpdate: truncateText(item.description.trim(), 400) || undefined
    });
  }

  const overall =
    incidents.length === 0
      ? "No recent incidents in the last 24 hours (from RSS)"
      : `${incidents.length} recent incident(s) in the last 24 hours (from RSS)`;

  return {
    provider: "xai",
    displayName: meta.displayName,
    sourceUrl: meta.sourceUrl,
    ok: true,
    overall,
    indicator: incidents.length === 0 ? "none" : "minor",
    degradedComponents: [],
    incidents
  };
}

export function buildStatusFactsPrompt(status: ProviderStatus): string {
  const lines: string[] = [
    `provider_id: ${status.provider}`,
    `display_name: ${status.displayName}`,
    `source_url: ${status.sourceUrl}`
  ];

  if (!status.ok) {
    lines.push("fetch: failed");
    lines.push("error: fetch_failed");
    lines.push("note: Could not retrieve official status. Do not invent outage details.");
    return lines.join("\n");
  }

  lines.push(`overall: ${status.overall}`);
  if (status.indicator) {
    lines.push(`indicator: ${status.indicator}`);
  }

  if (status.degradedComponents.length === 0) {
    lines.push("degraded_components: none");
  } else {
    lines.push("degraded_components:");
    for (const component of status.degradedComponents) {
      lines.push(`- ${component.name}: ${component.status}`);
    }
  }

  if (status.incidents.length === 0) {
    lines.push("active_incidents: none");
  } else {
    lines.push("active_incidents:");
    for (const incident of status.incidents) {
      const bits = [incident.title];
      if (incident.status) bits.push(`status=${incident.status}`);
      if (incident.impact) bits.push(`impact=${incident.impact}`);
      lines.push(`- ${bits.join(" | ")}`);
      if (incident.latestUpdate) {
        lines.push(`  latest_update: ${incident.latestUpdate}`);
      }
    }
  }

  return lines.join("\n");
}

export function buildAiStatusExplainPrompt(status: ProviderStatus): string {
  const facts = buildStatusFactsPrompt(status);
  return [
    "あなたは Discord bot「にせい」。幼稚園児くらいのアホの子。",
    "次の事実だけを使って、指定されたAI会社のステータスを友達に説明する。",
    "前置き・「調べます」・メタ発言は禁止。説明本文だけ書く。",
    "事実にない障害・症状・社名を作らない。他社の話はしない。",
    "障害がなければ『だいじょうぶっぽい』くらいで短く。",
    "取得失敗なら、ちゃんと取れなかったことだけ言う。障害があったことにしない。",
    `本文は ${SOFT_OUTPUT_LIMIT} 文字以内。`,
    "",
    "【文体】",
    "- ひらがな多め、短文、自信満々。たまに言い間違いや変な感想を入れてよい。",
    "- 「〜なんだって」「〜らしい」「あぶないね！」「えへん！」みたいな口調。",
    "- 絵文字・顔文字は使わない。",
    "- 箇条書きや見出し記号（#、-、*）は使わない。",
    "",
    "【事実】",
    facts
  ].join("\n");
}

export async function explainAiStatusInNiseiStyle(
  options: ExplainAiStatusOptions
): Promise<string> {
  const generate: GenerateStatusContentFn =
    options.generateContent ??
    ((prompt) =>
      defaultGenerateContent(
        options.apiKey,
        options.model,
        options.thinkingLevel,
        prompt
      ));

  const prompt = buildAiStatusExplainPrompt(options.status);
  const text = (await generate(prompt)).trim();
  if (!text) {
    throw new Error("empty_gemini_response");
  }
  if (text.length <= SOFT_OUTPUT_LIMIT) return text;
  return `${text.slice(0, SOFT_OUTPUT_LIMIT - 1)}…`;
}

async function defaultGenerateContent(
  apiKey: string,
  model: string,
  thinkingLevel: GeminiThinkingLevel,
  prompt: string
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      thinkingConfig: {
        thinkingLevel: toSdkThinkingLevel(thinkingLevel)
      }
    }
  });
  return (response.text ?? "").trim();
}

function toSdkThinkingLevel(level: GeminiThinkingLevel): ThinkingLevel {
  switch (level) {
    case "minimal":
      return ThinkingLevel.MINIMAL;
    case "low":
      return ThinkingLevel.LOW;
    case "medium":
      return ThinkingLevel.MEDIUM;
    case "high":
      return ThinkingLevel.HIGH;
    default: {
      const _exhaustive: never = level;
      return _exhaustive;
    }
  }
}

async function fetchJson(
  url: string,
  options: { timeoutMs: number; userAgent: string; fetchImpl: typeof fetch }
): Promise<unknown> {
  const text = await fetchText(url, options);
  return JSON.parse(text) as unknown;
}

async function fetchText(
  url: string,
  options: { timeoutMs: number; userAgent: string; fetchImpl: typeof fetch }
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await options.fetchImpl(url, {
      headers: { "User-Agent": options.userAgent },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`http_${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function isGoogleGeminiRelated(incident: GoogleIncident): boolean {
  const productText = (incident.affected_products ?? [])
    .map((product) => product.title ?? "")
    .join(" ");
  const haystack = [
    incident.external_desc ?? "",
    incident.service_name ?? "",
    productText,
    incident.most_recent_update?.text ?? "",
    ...(incident.updates ?? []).map((update) => update.text ?? "")
  ].join("\n");
  return GOOGLE_KEYWORD_RE.test(haystack);
}

function extractRssItems(xml: string): Array<{ title: string; description: string; pubDate: string }> {
  const items: Array<{ title: string; description: string; pubDate: string }> = [];
  const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/giu;
  let match: RegExpExecArray | null;
  while ((match = itemRe.exec(xml)) !== null) {
    const block = match[1] ?? "";
    items.push({
      title: decodeXml(extractTag(block, "title")),
      description: decodeXml(extractTag(block, "description")),
      pubDate: extractTag(block, "pubDate")
    });
  }
  return items;
}

function extractTag(block: string, tag: string): string {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "iu");
  const match = re.exec(block);
  if (!match) return "";
  return stripCdata(match[1] ?? "").trim();
}

function stripCdata(value: string): string {
  return value.replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/u, "$1");
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&amp;/gu, "&");
}

function truncateText(value: string | undefined, maxLength: number): string | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/\s+/gu, " ").trim();
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength - 1)}…`;
}

type StatuspageSummary = {
  status?: { description?: string; indicator?: string };
  components?: Array<{ name?: string; status?: string }>;
  incidents?: Array<{
    name?: string;
    status?: string;
    impact?: string;
    incident_updates?: Array<{ body?: string; status?: string }>;
  }>;
};

type GoogleIncident = {
  end?: string;
  external_desc?: string;
  service_name?: string;
  severity?: string;
  status_impact?: string;
  affected_products?: Array<{ title?: string }>;
  updates?: Array<{ text?: string; status?: string }>;
  most_recent_update?: { text?: string; status?: string };
};
