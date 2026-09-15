/** Curated company → domain map for reliable broker logos. */
const BROKER_DOMAINS = {
  "ic markets": "icmarkets.com",
  pepperstone: "pepperstone.com",
  exness: "exness.com",
  xm: "xm.com",
  "fp markets": "fpmarkets.com",
  tickmill: "tickmill.com",
  "blackbull markets": "blackbull.com",
  vantage: "vantagemarkets.com",
  "vantage markets": "vantagemarkets.com",
  fxpro: "fxpro.com",
  hfm: "hfm.com",
  "hotforex": "hfm.com",
  octa: "octafx.com",
  octafx: "octafx.com",
  eightcap: "eightcap.com",
  oanda: "oanda.com",
  "forex.com": "forex.com",
  ig: "ig.com",
  avatrade: "avatrade.com",
  "admiral markets": "admiralmarkets.com",
  admirals: "admiralmarkets.com",
  axi: "axi.com",
  axiory: "axiory.com",
  activtrades: "activtrades.com",
  alpari: "alpari.com",
  "atc brokers": "atcbrokers.com",
  bdswiss: "bdswiss.com",
  "blueberry markets": "blueberrymarkets.com",
  "capital.com": "capital.com",
  "cmc markets": "cmcmarkets.com",
  darwinex: "darwinex.com",
  dukascopy: "dukascopy.com",
  easymarkets: "easymarkets.com",
  "fxtm": "fxtm.com",
  "thinkmarkets": "thinkmarkets.com",
  "tmgm": "tmgm.com",
  "fusion markets": "fusionmarkets.com",
  "global prime": "globalprime.com",
  "gowmarkets": "gowmarkets.com",
  "hantec markets": "hantecfx.com",
  "iconic fx": "iconicfx.com",
  "ironfx": "ironfx.com",
  "justmarkets": "justmarkets.com",
  "litefinance": "litefinance.org",
  "lmax": "lmax.com",
  "markets.com": "markets.com",
  "multiBank": "multibankfx.com",
  "multibank": "multibankfx.com",
  "nordfx": "nordfx.com",
  "optimus futures": "optimusfutures.com",
  "plus500": "plus500.com",
  "puprime": "puprime.com",
  "roboforex": "roboforex.com",
  "robomarkets": "robomarkets.com",
  "robo markets": "robomarkets.com",
  "roboMarkets ltd": "robomarkets.com",
  "saxo": "home.saxo",
  "spreadex": "spreadex.com",
  "stark": "starkmarkets.com",
  "swissquote": "swissquote.com",
  "t4trade": "t4trade.com",
  "titan fx": "titanfx.com",
  "traders trust": "traders-trust.com",
  "tradex": "tradex.com",
  "vt markets": "vtmarkets.com",
  "windsorbrokers": "windsorbrokers.com",
  "xm global": "xm.com",
  "xtb": "xtb.com",
  "your online brokerage": "yobroker.com",
  "zeromarkets": "zeromarkets.com",
  "razor markets": "razormarkets.com",
  "razor markets (pty) ltd": "razormarkets.com",
  "razor markets sa": "razormarkets.com",
  "razormarkets": "razormarkets.com",
  "valor markets": "valormarkets.com",
  "valor markets ltd": "valormarkets.com",
  "gbe brokers": "gbebrokers.com",
  "fbs": "fbs.com",
  "instaforex": "instaforex.com",
  "freshforex": "freshforex.com",
  "forex4you": "forex4you.com",
  "grand capital": "grandcapital.net",
  "weltrade": "weltrade.com",
  "pocket option": "pocketoption.com",
  "binance": "binance.com",
  "bybit": "bybit.com",
  "fundingpips": "fundingpips.com",
  "ftmo": "ftmo.com",
  "the5ers": "the5ers.com",
  "fundednext": "fundednext.com",
  "topstep": "topstep.com",
};

function normalizeCompanyKey(company) {
  return String(company || "")
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/\s+/g, " ");
}

/** Strip legal suffixes so "Razor Markets (Pty) Ltd" → "razormarkets". */
function slugifyCompany(company) {
  return String(company || "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(
      /\b(pty|ltd|llc|inc|limited|group|corp|corporation|plc|sa|ag|gmbh|co|company|markets?|market|forex|fx|trading|capital|brokers?|brokerage|international|global)\b/gi,
      " "
    )
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

export function brokerInitials(company) {
  const words = String(company || "")
    .replace(/\(.*?\)/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w && !/^(pty|ltd|llc|inc|limited|sa|ag)$/i.test(w));
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] || ""}${words[1][0] || ""}`.toUpperCase();
}

export function resolveBrokerDomain(broker = {}) {
  const site = String(broker.site || broker.website || broker.domain || "").trim();
  if (site) {
    try {
      const host = site.includes("://")
        ? new URL(site).hostname
        : site.replace(/^www\./i, "");
      if (host.includes(".")) return host.replace(/^www\./i, "");
    } catch {
      // fall through
    }
  }

  const company = String(broker.company || broker.name || "").trim();
  const key = normalizeCompanyKey(company);
  if (BROKER_DOMAINS[key]) return BROKER_DOMAINS[key];

  // Try without trailing legal entity bits.
  const stripped = key
    .replace(/\(.*?\)/g, " ")
    .replace(/\b(pty|ltd|llc|inc|limited|sa)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (BROKER_DOMAINS[stripped]) return BROKER_DOMAINS[stripped];

  // Partial key match (e.g. "Razor Markets (Pty) Ltd" contains "razor markets").
  for (const [name, domain] of Object.entries(BROKER_DOMAINS)) {
    if (key.includes(name) || name.includes(stripped)) return domain;
  }

  const slug = slugifyCompany(company);
  if (slug.length >= 3) return `${slug}.com`;
  return "";
}

/**
 * Logo URL candidates for a broker search row (first wins, then fallbacks).
 * Prefer DuckDuckGo icons (often sharper), then Google favicons.
 * Callers should fall back to initials when all fail.
 */
export function resolveBrokerLogoCandidates(broker = {}) {
  if (broker.logoUrl) return [String(broker.logoUrl).trim()].filter(Boolean);
  const domain = resolveBrokerDomain(broker);
  if (!domain) return [];
  return [
    `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`,
    `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(`https://${domain}`)}`,
  ];
}

/** @deprecated prefer resolveBrokerLogoCandidates */
export function resolveBrokerLogoUrl(broker = {}) {
  return resolveBrokerLogoCandidates(broker)[0] || "";
}
