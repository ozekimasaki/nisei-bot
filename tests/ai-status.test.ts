import { describe, expect, it, vi } from "vitest";
import {
  buildAiStatusExplainPrompt,
  buildStatusFactsPrompt,
  explainAiStatusInNiseiStyle,
  fetchProviderStatus,
  parseGoogleIncidents,
  parseStatuspageSummary,
  parseXaiRss,
  type ProviderStatus
} from "../src/ai-status.js";

describe("parseStatuspageSummary", () => {
  it("keeps active incidents and degraded components", () => {
    const status = parseStatuspageSummary("openai", {
      status: { description: "Partial System Degradation", indicator: "minor" },
      components: [
        { name: "Conversations", status: "degraded_performance" },
        { name: "Login", status: "operational" }
      ],
      incidents: [
        {
          name: "Elevated conversation errors",
          status: "investigating",
          impact: "minor",
          incident_updates: [{ body: "We are investigating elevated errors." }]
        },
        {
          name: "Old outage",
          status: "resolved",
          impact: "major",
          incident_updates: [{ body: "Resolved." }]
        }
      ]
    });

    expect(status.ok).toBe(true);
    if (!status.ok) return;
    expect(status.overall).toBe("Partial System Degradation");
    expect(status.indicator).toBe("minor");
    expect(status.degradedComponents).toEqual([
      { name: "Conversations", status: "degraded_performance" }
    ]);
    expect(status.incidents).toHaveLength(1);
    expect(status.incidents[0]?.title).toBe("Elevated conversation errors");
    expect(status.incidents[0]?.latestUpdate).toContain("investigating");
  });

  it("reports all clear when nothing is wrong", () => {
    const status = parseStatuspageSummary("claude", {
      status: { description: "All Systems Operational", indicator: "none" },
      components: [{ name: "claude.ai", status: "operational" }],
      incidents: []
    });

    expect(status.ok).toBe(true);
    if (!status.ok) return;
    expect(status.degradedComponents).toEqual([]);
    expect(status.incidents).toEqual([]);
    expect(status.overall).toBe("All Systems Operational");
  });
});

describe("parseGoogleIncidents", () => {
  it("keeps only open Gemini-related incidents", () => {
    const status = parseGoogleIncidents([
      {
        end: undefined,
        external_desc: "Vertex Gemini API elevated errors",
        severity: "high",
        status_impact: "SERVICE_DISRUPTION",
        affected_products: [{ title: "Vertex Gemini API" }],
        most_recent_update: {
          text: "Customers may see 503 errors on Gemini.",
          status: "SERVICE_DISRUPTION"
        }
      },
      {
        end: undefined,
        external_desc: "VPC latency in Delhi",
        affected_products: [{ title: "Virtual Private Cloud" }],
        most_recent_update: { text: "Network issue", status: "SERVICE_DISRUPTION" }
      },
      {
        end: "2026-03-01T00:00:00Z",
        external_desc: "Old Gemini incident",
        affected_products: [{ title: "Vertex Gemini API" }],
        most_recent_update: { text: "Resolved", status: "AVAILABLE" }
      }
    ]);

    expect(status.ok).toBe(true);
    if (!status.ok) return;
    expect(status.incidents).toHaveLength(1);
    expect(status.incidents[0]?.title).toContain("Vertex Gemini");
    expect(status.indicator).toBe("minor");
  });

  it("reports none when no matching open incidents", () => {
    const status = parseGoogleIncidents([
      {
        end: "2026-03-01T00:00:00Z",
        external_desc: "Old Gemini incident",
        affected_products: [{ title: "Vertex Gemini API" }]
      }
    ]);

    expect(status.ok).toBe(true);
    if (!status.ok) return;
    expect(status.incidents).toEqual([]);
    expect(status.indicator).toBe("none");
  });
});

describe("parseXaiRss", () => {
  const now = new Date("2026-07-12T12:00:00Z");

  it("keeps only recent unresolved items within 24h", () => {
    const xml = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item>
    <title>[API] Elevated errors</title>
    <description>Some users see failures</description>
    <pubDate>Sat, 11 Jul 2026 20:00:00 GMT</pubDate>
  </item>
  <item>
    <title>[API] Old issue Resolved</title>
    <description>Fixed</description>
    <pubDate>Sat, 11 Jul 2026 18:00:00 GMT</pubDate>
  </item>
  <item>
    <title>[API] Ancient issue</title>
    <description>Too old</description>
    <pubDate>Tue, 07 Jul 2026 15:40:26 GMT</pubDate>
  </item>
</channel></rss>`;

    const status = parseXaiRss(xml, now);
    expect(status.ok).toBe(true);
    if (!status.ok) return;
    expect(status.incidents).toHaveLength(1);
    expect(status.incidents[0]?.title).toContain("Elevated errors");
  });

  it("reports none when feed has no recent items", () => {
    const xml = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item>
    <title>[API] Ancient issue</title>
    <pubDate>Tue, 07 Jul 2026 15:40:26 GMT</pubDate>
  </item>
</channel></rss>`;

    const status = parseXaiRss(xml, now);
    expect(status.ok).toBe(true);
    if (!status.ok) return;
    expect(status.incidents).toEqual([]);
    expect(status.overall).toContain("No recent incidents");
  });
});

describe("buildStatusFactsPrompt", () => {
  it("includes fetch failure facts without inventing outages", () => {
    const status: ProviderStatus = {
      provider: "openai",
      displayName: "OpenAI",
      sourceUrl: "https://status.openai.com/",
      ok: false,
      error: "fetch_failed"
    };
    const facts = buildStatusFactsPrompt(status);
    expect(facts).toContain("fetch: failed");
    expect(facts).toContain("fetch_failed");
    expect(facts).not.toContain("active_incidents:");
  });
});

describe("explainAiStatusInNiseiStyle", () => {
  it("passes facts into the prompt and returns Gemini text", async () => {
    const status = parseStatuspageSummary("openai", {
      status: { description: "All Systems Operational", indicator: "none" },
      components: [],
      incidents: []
    });

    const generateContent = vi.fn(async (prompt: string) => {
      expect(prompt).toContain("All Systems Operational");
      expect(prompt).toContain("にせい");
      return "OpenAIはだいじょうぶっぽい。えへん！";
    });

    const text = await explainAiStatusInNiseiStyle({
      apiKey: "test-key",
      model: "gemini-test",
      thinkingLevel: "minimal",
      status,
      generateContent
    });

    expect(text).toBe("OpenAIはだいじょうぶっぽい。えへん！");
    expect(generateContent).toHaveBeenCalledOnce();
  });

  it("throws when Gemini returns empty text", async () => {
    const status = parseStatuspageSummary("claude", {
      status: { description: "All Systems Operational", indicator: "none" },
      components: [],
      incidents: []
    });

    await expect(
      explainAiStatusInNiseiStyle({
        apiKey: "test-key",
        model: "gemini-test",
        thinkingLevel: "minimal",
        status,
        generateContent: async () => "   "
      })
    ).rejects.toThrow("empty_gemini_response");
  });

  it("builds an explain prompt that forbids inventing other providers", () => {
    const status = parseStatuspageSummary("claude", {
      status: { description: "All Systems Operational", indicator: "none" },
      components: [],
      incidents: []
    });
    const prompt = buildAiStatusExplainPrompt(status);
    expect(prompt).toContain("他社の話はしない");
    expect(prompt).toContain("display_name: Claude");
  });

  it("builds an explain prompt that keeps brand names readable", () => {
    const status = parseStatuspageSummary("openai", {
      status: { description: "Partial System Degradation", indicator: "minor" },
      components: [],
      incidents: []
    });
    const prompt = buildAiStatusExplainPrompt(status);
    expect(prompt).toContain("ひらがなにバラさない");
    expect(prompt).toContain("一文字ずつの読み書きは禁止");
    expect(prompt).toContain("【構成】");
    expect(prompt).toContain("【よい例】");
    expect(prompt).toContain("OpenAIちょっとよわよわ！");
  });
});

describe("fetchProviderStatus", () => {
  it("fetches only the requested provider URL", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toBe("https://status.openai.com/api/v2/summary.json");
      return new Response(
        JSON.stringify({
          status: { description: "All Systems Operational", indicator: "none" },
          components: [],
          incidents: []
        }),
        { status: 200 }
      );
    });

    const status = await fetchProviderStatus("openai", { fetchImpl });
    expect(status.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("returns fetch_failed when the request fails", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });

    const status = await fetchProviderStatus("xai", { fetchImpl });
    expect(status).toEqual({
      provider: "xai",
      displayName: "xAI",
      sourceUrl: "https://status.x.ai/",
      ok: false,
      error: "fetch_failed"
    });
  });

  it("does not call other provider URLs for google", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toBe("https://status.cloud.google.com/incidents.json");
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const status = await fetchProviderStatus("google", { fetchImpl });
    expect(status.ok).toBe(true);
    if (!status.ok) return;
    expect(status.incidents).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
