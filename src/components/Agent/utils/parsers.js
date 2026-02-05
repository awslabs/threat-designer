export const getFaviconUrl = (url) => {
  if (!url) return null;
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  } catch {
    return null;
  }
};

export const parseWebResults = (content) => {
  if (!content) return [];

  try {
    const parsed = typeof content === "string" ? JSON.parse(content) : content;

    if (Array.isArray(parsed)) {
      return parsed.map((r, i) => ({
        id: i,
        title: r.title || r.name || r.url || `Result ${i + 1}`,
        url: r.url || r.link,
        favicon: getFaviconUrl(r.url || r.link),
      }));
    }

    if (parsed.results && Array.isArray(parsed.results)) {
      return parsed.results.map((r, i) => ({
        id: i,
        title: r.title || r.name || r.url || `Result ${i + 1}`,
        url: r.url || r.link,
        favicon: getFaviconUrl(r.url || r.link),
      }));
    }

    if (parsed.url) {
      return [
        {
          id: 0,
          title: parsed.title || parsed.url,
          url: parsed.url,
          favicon: getFaviconUrl(parsed.url),
        },
      ];
    }

    return [];
  } catch {
    return [];
  }
};

export const parseThreatResults = (content) => {
  if (!content) return [];

  try {
    const parsed = typeof content === "string" ? JSON.parse(content) : content;

    if (Array.isArray(parsed)) {
      return parsed.map((threat, i) => {
        if (typeof threat === "string") return { id: i, name: threat };
        if (typeof threat === "number") return { id: threat, name: `Threat ${threat}` };
        return {
          id: threat.id || i,
          name: threat.name || threat.title || threat.threat || `Threat ${threat.id || i + 1}`,
        };
      });
    }

    if (parsed.threats && Array.isArray(parsed.threats)) {
      return parsed.threats.map((threat, i) => {
        if (typeof threat === "string") return { id: i, name: threat };
        return {
          id: threat.id || i,
          name: threat.name || threat.title || threat.threat || `Threat ${i + 1}`,
        };
      });
    }

    const resultKeys = [
      "response",
      "affected",
      "added",
      "deleted",
      "updated",
      "removed",
      "removed_threats",
      "deleted_threats",
      "added_threats",
      "results",
      "items",
      "data",
      "ids",
      "threat_ids",
    ];

    const foundKey = resultKeys.find((key) => parsed[key] && Array.isArray(parsed[key]));
    if (foundKey) {
      return parsed[foundKey].map((threat, i) => {
        if (typeof threat === "string") return { id: i, name: threat };
        if (typeof threat === "number") return { id: threat, name: `Threat ${threat}` };
        return {
          id: threat.id || i,
          name: threat.name || threat.title || threat.threat || `Threat ${threat.id || i + 1}`,
        };
      });
    }

    if (parsed.name || parsed.title || parsed.threat || parsed.id) {
      return [
        {
          id: parsed.id || 0,
          name: parsed.name || parsed.title || parsed.threat || `Threat ${parsed.id || 1}`,
        },
      ];
    }

    return [];
  } catch {
    return [];
  }
};

export const getResultCount = (content) => {
  if (!content) return 0;

  try {
    const parsed = typeof content === "string" ? JSON.parse(content) : content;
    if (Array.isArray(parsed)) return parsed.length;
    if (parsed.results && Array.isArray(parsed.results)) return parsed.results.length;
    if (parsed.threats && Array.isArray(parsed.threats)) return parsed.threats.length;
    return 1;
  } catch {
    return content ? 1 : 0;
  }
};

export const formatRawContent = (content) => {
  if (!content) return "No content";

  try {
    const parsed = typeof content === "string" ? JSON.parse(content) : content;
    return JSON.stringify(parsed, null, 2);
  } catch {
    return String(content);
  }
};
