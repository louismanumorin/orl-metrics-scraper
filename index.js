import express from "express";
import chromium from "chrome-aws-lambda";
import puppeteer from "puppeteer-core";

const app = express();
app.use(express.json());

async function launchBrowser() {
  return await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath,
    headless: chromium.headless,
  });
}

async function scrapeWileyMetrics(doi) {
  const url = `https://onlinelibrary.wiley.com/doi/${doi}`;

  const browser = await launchBrowser();
  const page = await browser.newPage();

  await page.goto(url, { waitUntil: "networkidle2" });

  // Clique sur l’onglet Information
  await page.waitForSelector('button[aria-controls="information-panel"]', { timeout: 8000 });
  await page.click('button[aria-controls="information-panel"]');

  // Attendre que les métrics apparaissent
  await page.waitForSelector(".metrics", { timeout: 8000 });

  const result = await page.evaluate(() => {
    const metricsBox = document.querySelector(".metrics");
    if (!metricsBox) return null;

    const text = metricsBox.innerText;

    const fullViews = text.match(/Full text views:\s*([\d,]+)/i);
    const pdf = text.match(/PDF downloads:\s*([\d,]+)/i);

    return {
      views: fullViews ? parseInt(fullViews[1].replace(/,/g, ""), 10) : null,
      pdfDownloads: pdf ? parseInt(pdf[1].replace(/,/g, ""), 10) : null,
      rawText: text
    };
  });

  await browser.close();

  return result;
}

app.post("/scrape-metrics", async (req, res) => {
  const { articles } = req.body;

  const results = [];

  for (const article of articles) {
    const doi = article.doi;

    const metrics = await scrapeWileyMetrics(doi);

    results.push({
      doi,
      finalUrl: `https://onlinelibrary.wiley.com/doi/${doi}`,
      platform: "wiley",
      ...metrics
    });
  }

  res.json({ results });
});

app.get("/", (req, res) => {
  res.send("Puppeteer Wiley Scraper is running ✔️");
});

app.listen(3000, () => console.log("Puppeteer Scraper running on port 3000"));
