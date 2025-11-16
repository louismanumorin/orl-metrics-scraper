import express from "express";
import * as cheerio from "cheerio";   // <-- FIXED for ESM
import fetch from "node-fetch";

const app = express();
app.use(express.json());

/* -------------------------------
   UTILS
-------------------------------- */

async function fetchHTML(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.0)",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  return await res.text();
}

async function resolveDOI(doi) {
  const url = "https://doi.org/" + doi;

  const res = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  return res.url; // Final journal page
}

function detectPlatform(url) {
  if (url.includes("wiley.com")) return "wiley";
  if (url.includes("jamanetwork.com")) return "jama";
  if (url.includes("sciencedirect.com")) return "elsevier";
  if (url.includes("cambridge.org")) return "cambridge";
  if (url.includes("tandfonline.com")) return "tandf";
  if (url.includes("sagepub.com")) return "sage";
  if (url.includes("lww.com")) return "lww";
  if (url.includes("rhinologyjournal")) return "rhinology";
  return "unknown";
}

/* -------------------------------
   SCRAPERS
-------------------------------- */

/* ---- JAMA ---- */
async function scrapeJama(html) {
  const $ = cheerio.load(html);

  const metrics = $('div[aria-label="Article Metrics"]').text().toLowerCase();

  const views = metrics.match(/views[:\s]*([\d,]+)/);
  const pdf = metrics.match(/pdf downloads[:\s]*([\d,]+)/);

  return {
    views: views ? parseInt(views[1].replace(/,/g, "")) : null,
    pdfDownloads: pdf ? parseInt(pdf[1].replace(/,/g, "")) : null,
    source: "html-jama",
  };
}

/* ---- WILEY ---- */
async function scrapeWiley(html) {
  const $ = cheerio.load(html);

  // The "Information" tab contains metrics
  const info = $('section:contains("Full text views")').text().toLowerCase();

  const views = info.match(/full text views[:\s]*([\d,]+)/);
  const pdf = info.match(/pdf downloads[:\s]*([\d,]+)/);

  return {
    views: views ? parseInt(views[1].replace(/,/g, "")) : null,
    pdfDownloads: pdf ? parseInt(pdf[1].replace(/,/g, "")) : null,
    source: "html-wiley",
  };
}

/* ---- Elsevier (ScienceDirect) ---- */
async function scrapeElsevier(html) {
  const $ = cheerio.load(html);

  const metrics = $('div:contains("Views")').text().toLowerCase();

  const views = metrics.match(/views[:\s]*([\d,]+)/);

  return {
    views: views ? parseInt(views[1].replace(/,/g, "")) : null,
    pdfDownloads: null,
    source: "html-elsevier",
  };
}

/* -------------------------------
   MAIN SCRAPER
-------------------------------- */

async function scrapeArticle(doi) {
  const finalUrl = await resolveDOI(doi);
  const html = await fetchHTML(finalUrl);
  const platform = detectPlatform(finalUrl);

  if (platform === "jama") return { doi, finalUrl, platform, ...(await scrapeJama(html)) };
  if (platform === "wiley") return { doi, finalUrl, platform, ...(await scrapeWiley(html)) };
  if (platform === "elsevier") return { doi, finalUrl, platform, ...(await scrapeElsevier(html)) };

  return {
    doi,
    finalUrl,
    platform,
    views: null,
    pdfDownloads: null,
    source: "unsupported",
  };
}

/* -------------------------------
   API ENDPOINT
-------------------------------- */

app.post("/scrape-metrics", async (req, res) => {
  const { articles } = req.body;

  const results = [];
  for (const a of articles) {
    results.push(await scrapeArticle(a.doi));
  }

  res.json({ results });
});

app.get("/", (req, res) =>
  res.send("ORL Metrics Scraper running ✔️")
);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port " + PORT));
