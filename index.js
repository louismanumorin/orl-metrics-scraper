import express from "express";
import cheerio from "cheerio";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.send("ORL Metrics Scraper running ✔️");
});

/*
  JOURNAL DETECTORS
*/
function detectPlatform(url) {
  if (url.includes("jamanetwork.com")) return "jamanetwork";
  if (url.includes("wiley.com")) return "wiley";
  if (url.includes("thejns.org")) return "thejns";
  if (url.includes("sciencedirect.com")) return "elsevier";
  return "unknown";
}

/*
  SCRAPE JAMA
*/
async function scrapeJama(html) {
  const $ = cheerio.load(html);
  const metricsText = $('div:contains("Article Views")').text();

  const views = metricsText.match(/Views:\s*([\d,]+)/);
  const pdf = metricsText.match(/PDF Downloads:\s*([\d,]+)/);

  return {
    views: views ? parseInt(views[1].replace(/,/g, "")) : null,
    pdfDownloads: pdf ? parseInt(pdf[1].replace(/,/g, "")) : null,
    source: "html-jama"
  };
}

/*
  SCRAPE WILEY (HTML fallback, car API bloquée par IP)
*/
async function scrapeWiley(html) {
  const $ = cheerio.load(html);

  // On cherche dans la tab “Information”
  const metricsBox = $('div[id="articleInfo"]')
    .text()
    .toLowerCase();

  const views = metricsBox.match(/full text views:\s*([\d,]+)/);
  const pdf = metricsBox.match(/pdf downloads:\s*([\d,]+)/);

  return {
    views: views ? parseInt(views[1].replace(/,/g, "")) : null,
    pdfDownloads: pdf ? parseInt(pdf[1].replace(/,/g, "")) : null,
    source: "html-wiley"
  };
}

/*
  MAIN SCRAPER
*/
async function scrapeArticle(doi) {
  const doiUrl = "https://doi.org/" + doi;

  const response = await fetch(doiUrl, {
    redirect: "follow",
    headers: {
      "User-Agent": "Mozilla/5.0"
    }
  });

  const finalUrl = response.url;
  const html = await response.text();

  const platform = detectPlatform(finalUrl);

  if (platform === "jamanetwork") return { doi, finalUrl, journalPlatform: "jamanetwork", ...(await scrapeJama(html)) };
  if (platform === "wiley") return { doi, finalUrl, journalPlatform: "wiley", ...(await scrapeWiley(html)) };

  return {
    doi,
    finalUrl,
    journalPlatform: "unknown",
    views: null,
    pdfDownloads: null,
    note: "Plateforme non supportée"
  };
}

/*
  API ENDPOINT
*/
app.post("/scrape-metrics", async (req, res) => {
  try {
    const { articles } = req.body;

    const results = [];
    for (const a of articles) {
      results.push(await scrapeArticle(a.doi));
    }

    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("ORL metrics scraper running ✔️ on port", PORT));
