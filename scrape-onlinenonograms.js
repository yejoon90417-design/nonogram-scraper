const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { chromium } = require("playwright");

const BASE_URL = "https://onlinenonograms.com";
const LANG = process.env.ONN_LANG || "en";
const CATALOG_PATH = process.env.ONN_CATALOG || "bw/micro";
const PAGE_COUNT = Math.max(1, Number(process.env.ONN_PAGES || 1));
const FETCH_DETAILS = String(process.env.ONN_FETCH_DETAILS || "1") !== "0";
const FETCH_PUZZLE = String(process.env.ONN_FETCH_PUZZLE || "1") !== "0";
const LIMIT = Math.max(0, Number(process.env.ONN_LIMIT || 0));
const OUT_DIR = path.join(
  __dirname,
  "out",
  "onlinenonograms",
  LANG,
  CATALOG_PATH.replace(/[\\/]+/g, "-")
);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseSize(sizeText) {
  const normalized = String(sizeText || "")
    .replace(/×/g, "x")
    .replace(/\s+/g, "");
  const match = normalized.match(/^(\d+)x(\d+)$/i);
  if (!match) return { width: null, height: null };
  return { width: Number(match[1]), height: Number(match[2]) };
}

function swapPayloadAlphabet(encoded) {
  return String(encoded || "")
    .split("")
    .map((ch) => (ch === "2" ? "1" : ch === "a" ? "2" : ch === "1" ? "a" : ch))
    .join("");
}

function decodePuzzleBlob(encoded) {
  const swapped = swapPayloadAlphabet(encoded);
  const compressed = Buffer.from(swapped, "base64");
  const json = zlib.inflateRawSync(compressed).toString("utf8");
  return JSON.parse(json);
}

function toRowMajor(moveColumns) {
  const width = Array.isArray(moveColumns) ? moveColumns.length : 0;
  const height = width > 0 && Array.isArray(moveColumns[0]) ? moveColumns[0].length : 0;
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => (moveColumns[x][y] === 9 ? 0 : 1))
  );
}

function transpose(rows) {
  const height = rows.length;
  const width = height > 0 ? rows[0].length : 0;
  return Array.from({ length: width }, (_, x) =>
    Array.from({ length: height }, (_, y) => rows[y][x])
  );
}

function buildClues(lines) {
  return lines.map((line) => {
    const clues = [];
    let run = 0;
    for (const cell of line) {
      if (cell) {
        run += 1;
      } else if (run > 0) {
        clues.push(run);
        run = 0;
      }
    }
    if (run > 0) clues.push(run);
    return clues.length > 0 ? clues : [0];
  });
}

function normalizePuzzleRecord(payload, decodedPuzzle) {
  const solutionRows = toRowMajor(decodedPuzzle.move || []);
  const solutionStrings = solutionRows.map((row) => row.join(""));
  const rowHints = buildClues(solutionRows);
  const colHints = buildClues(transpose(solutionRows));

  return {
    payload,
    decodedPuzzle,
    width: Number(payload?.sx || 0),
    height: Number(payload?.sy || 0),
    title:
      decodedPuzzle?.en_title
      || decodedPuzzle?.ru_title
      || payload?.url
      || "",
    solutionRows,
    solutionStrings,
    rowHints,
    colHints,
  };
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
      accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status}`);
  }
  return res.text();
}

async function fetchDetailMeta(detailUrl) {
  const html = await fetchText(detailUrl);
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const canonicalMatch = html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i);
  const previewMatch = html.match(/<img[^>]+src="([^"]*\/storage\/preview\/\d+\.webp)"/i);
  const publishedMatch = html.match(/Published<\/div><div[^>]*>([^<]+)</i);
  const sizeMatch = html.match(/Size<\/div><div[^>]*>(\d+).*?(\d+)</i);
  return {
    detailTitle: decodeHtml(titleMatch?.[1] || ""),
    canonicalUrl: canonicalMatch?.[1] || detailUrl,
    detailPreviewUrl: previewMatch ? new URL(previewMatch[1], BASE_URL).href : "",
    publishedText: decodeHtml(publishedMatch?.[1] || ""),
    detailWidth: sizeMatch ? Number(sizeMatch[1]) : null,
    detailHeight: sizeMatch ? Number(sizeMatch[2]) : null,
  };
}

async function scrapeCatalogPage(page, pageNumber) {
  const suffix = pageNumber > 1 ? `?page=${pageNumber}` : "";
  const url = `${BASE_URL}/${LANG}/catalog/${CATALOG_PATH}${suffix}`;

  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await page.waitForSelector(`main a[href^="/${LANG}/id/"]`, { timeout: 120000 });

  const items = await page.evaluate(({ lang }) => {
    const parseCount = (root, selector) => {
      const text = root.querySelector(selector)?.textContent || "";
      const match = text.match(/\d+/);
      return match ? Number(match[0]) : null;
    };

    return Array.from(document.querySelectorAll("main .rounded-lg.overflow-hidden.border"))
      .map((card) => {
        const anchors = Array.from(card.querySelectorAll(`a[href^="/${lang}/id/"]`));
        const link = anchors.find((anchor) => /\/id\/\d+/.test(anchor.getAttribute("href") || ""));
        if (!link) return null;
        const href = link.getAttribute("href") || "";
        const idMatch = href.match(/\/id\/(\d+)/);
        if (!idMatch) return null;

        const titleText =
          card.querySelector(".text-sm.font-medium")?.textContent?.trim()
          || `#${idMatch[1]}`;
        const previewImg = card.querySelector("img");
        const sizeText = Array.from(card.querySelectorAll(".text-sm.text-muted-foreground"))
          .map((node) => node.textContent?.trim() || "")
          .find((text) => /[\d]+\s*[x×]\s*[\d]+/.test(text));

        return {
          puzzleId: Number(idMatch[1]),
          titleText,
          detailPath: href,
          detailUrl: new URL(href, window.location.origin).href,
          previewUrl: previewImg ? new URL(previewImg.getAttribute("src") || "", window.location.origin).href : "",
          previewAlt: previewImg?.getAttribute("alt") || "",
          sizeText: sizeText || "",
          likes: parseCount(card, ".text-green-600"),
          dislikes: parseCount(card, ".text-red-600"),
        };
      })
      .filter(Boolean);
  }, { lang: LANG });

  return { url, items };
}

async function fetchPlayablePuzzle(page, detailUrl) {
  await page.goto(detailUrl, {
    waitUntil: "networkidle",
    timeout: 120000,
  });

  const playButton = page.getByRole("button", { name: /^Play$/i }).first();
  await playButton.waitFor({ state: "visible", timeout: 120000 });
  await playButton.click();

  await page.waitForTimeout(2000);

  let frame = page.frames().find((item) =>
    item.url().includes("/engines/picross/index.html")
  );
  if (!frame && page.url().includes("/engines/picross/index.html")) {
    frame = page.mainFrame();
  }
  if (!frame) {
    await page.waitForFunction(
      () => location.href.includes("/engines/picross/index.html")
        || Array.from(document.querySelectorAll("iframe")).some((node) =>
          String(node.src || "").includes("/engines/picross/index.html")
        ),
      { timeout: 120000 }
    );
    frame = page.frames().find((item) =>
      item.url().includes("/engines/picross/index.html")
    );
    if (!frame && page.url().includes("/engines/picross/index.html")) {
      frame = page.mainFrame();
    }
  }

  if (!frame) {
    throw new Error(`Puzzle iframe not found after clicking Play (${detailUrl})`);
  }

  await frame.waitForFunction(
    () => typeof window !== "undefined"
      && !!window.GrandGames
      && typeof window.GrandGames.init === "function",
    { timeout: 120000 }
  );

  const payload = await frame.evaluate(async () => {
    const sdk = await window.GrandGames.init();
    return sdk.getData();
  });

  if (!payload?.p) {
    throw new Error("Missing puzzle payload");
  }

  return payload;
}

(async () => {
  ensureDir(OUT_DIR);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const puzzlePage = await context.newPage();

  await context.route("**/*", (route) => {
    const type = route.request().resourceType();
    const requestUrl = route.request().url();
    if (!requestUrl.startsWith(BASE_URL)) return route.abort();
    if (type === "image" || type === "font" || type === "media") return route.abort();
    return route.continue();
  });

  page.setDefaultTimeout(120000);
  puzzlePage.setDefaultTimeout(120000);

  const collected = new Map();

  try {
    for (let pageNumber = 1; pageNumber <= PAGE_COUNT; pageNumber += 1) {
      const { url, items } = await scrapeCatalogPage(page, pageNumber);
      console.log(`[catalog] page ${pageNumber}: ${items.length} items from ${url}`);

      for (const item of items) {
        const size = parseSize(item.sizeText);
        const record = {
          source: "onlinenonograms",
          lang: LANG,
          category: CATALOG_PATH,
          pageNumber,
          puzzleId: item.puzzleId,
          title: item.titleText,
          width: size.width,
          height: size.height,
          detailUrl: item.detailUrl,
          previewUrl: item.previewUrl,
          previewAlt: item.previewAlt,
          likes: item.likes,
          dislikes: item.dislikes,
          scrapedAt: new Date().toISOString(),
        };
        collected.set(item.puzzleId, record);
      }
      await sleep(250);
    }

    if (FETCH_DETAILS) {
      const detailRecords = LIMIT > 0 ? Array.from(collected.values()).slice(0, LIMIT) : Array.from(collected.values());
      for (const record of detailRecords) {
        try {
          const detail = await fetchDetailMeta(record.detailUrl);
          record.detailTitle = detail.detailTitle || record.title;
          record.title = detail.detailTitle || record.title;
          record.canonicalUrl = detail.canonicalUrl;
          record.publishedText = detail.publishedText;
          record.previewUrl = detail.detailPreviewUrl || record.previewUrl;
          record.width = detail.detailWidth || record.width;
          record.height = detail.detailHeight || record.height;
          console.log(`[detail] #${record.puzzleId} -> ${record.title}`);
          await sleep(150);
        } catch (err) {
          record.detailError = err.message;
          console.log(`[detail] #${record.puzzleId} failed: ${err.message}`);
        }
      }
    }

    if (FETCH_PUZZLE) {
      const puzzleRecords = LIMIT > 0 ? Array.from(collected.values()).slice(0, LIMIT) : Array.from(collected.values());
      for (const record of puzzleRecords) {
        try {
          const payload = await fetchPlayablePuzzle(puzzlePage, record.detailUrl);
          const normalized = normalizePuzzleRecord(payload, decodePuzzleBlob(payload.p));

          record.width = normalized.width || record.width;
          record.height = normalized.height || record.height;
          record.decodedTitle = normalized.title;
          record.title = normalized.title || record.title;
          record.payload = normalized.payload;
          record.decodedPuzzle = normalized.decodedPuzzle;
          record.solutionRows = normalized.solutionRows;
          record.solutionStrings = normalized.solutionStrings;
          record.rowHints = normalized.rowHints;
          record.colHints = normalized.colHints;

          console.log(
            `[puzzle] #${record.puzzleId} -> ${record.title} (${record.width}x${record.height})`
          );
          await sleep(200);
        } catch (err) {
          record.puzzleError = err.message;
          console.log(`[puzzle] #${record.puzzleId} failed: ${err.message}`);
        }
      }
    }

    const records = Array.from(collected.values()).sort((a, b) => a.puzzleId - b.puzzleId);
    for (const record of records) {
      const filePath = path.join(OUT_DIR, `${record.puzzleId}.json`);
      fs.writeFileSync(filePath, JSON.stringify(record, null, 2), "utf8");
    }

    const indexPath = path.join(OUT_DIR, "_index.json");
    fs.writeFileSync(indexPath, JSON.stringify(records, null, 2), "utf8");

    console.log(`[done] saved ${records.length} puzzles to ${OUT_DIR}`);
  } finally {
    await context.close();
    await browser.close();
  }
})().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
