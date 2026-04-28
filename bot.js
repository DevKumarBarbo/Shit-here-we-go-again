const { chromium } = require("playwright");
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const fs = require("fs");

process.env.DISABLE_HEADLESS_WARNING = "1";

const CONFIG = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  NEWS_CHANNEL_ID: process.env.NEWS_CHANNEL_ID,
  WATCH_ACCOUNTS: [
    "elonmusk",
    "NASA",
    "NVIDIAGeForce",
    "Intel",
    "Google",
    "YouTube",
    "HINDU_KlNG"
  ],
  SEEN_FILE: "seen_ids.json",
};

// ---------- STORAGE ----------

function loadSeen() {
  try {
    if (fs.existsSync(CONFIG.SEEN_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG.SEEN_FILE, "utf8"));
    }
  } catch {}
  return {};
}

function saveSeen(seen) {
  fs.writeFileSync(CONFIG.SEEN_FILE, JSON.stringify(seen, null, 2));
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- BROWSER ----------

async function launchBrowser() {
  console.log("Launching browser...");

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--single-process",
      "--no-zygote"
    ],
  });

  console.log("Creating page...");

  const page = await browser.newPage({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
  });

  // Block heavy resources
  await page.route("**/*", route => {
    const type = route.request().resourceType();
    if (type === "image" || type === "media" || type === "font") {
      route.abort();
    } else {
      route.continue();
    }
  });

  console.log("Browser ready");
  return { browser, page };
}

// ---------- FETCH ----------

async function fetchTweets(page, handle) {
  console.log(`Opening @${handle}...`);

  try {
    await page.goto(`https://x.com/${handle}`, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
  } catch (e) {
    console.log(`[${handle}] Page failed (blocked or timeout)`);
    return [];
  }

  try {
    await page.waitForSelector('article[data-testid="tweet"]', {
      timeout: 10000,
    });
  } catch {
    console.log(`[${handle}] No tweets loaded (likely blocked)`);
    return [];
  }

  const tweets = await page.evaluate(() => {
    const results = [];
    const articles = document.querySelectorAll(
      'article[data-testid="tweet"]'
    );

    for (const article of articles) {
      try {
        const textEl = article.querySelector('[data-testid="tweetText"]');
        const text = textEl ? textEl.innerText : "";

        const timeEl = article.querySelector("time");
        const linkEl = timeEl?.closest("a");
        const href = linkEl?.href || "";

        const idMatch = href.match(/status\/(\d+)/);
        const id = idMatch ? idMatch[1] : null;

        if (id) {
          results.push({
            id,
            text,
            href,
          });
        }
      } catch {}
    }

    return results;
  });

  console.log(`[${handle}] Found ${tweets.length}`);
  return tweets;
}

// ---------- EMBED ----------

function buildEmbed(tweet, handle) {
  const cleanText = tweet.text
    .replace(/https:\/\/t\.co\/\S+/g, "")
    .trim();

  return new EmbedBuilder()
    .setColor(0x1d9bf0)
    .setAuthor({
      name: `@${handle}`,
      url: `https://x.com/${handle}`,
      iconURL: `https://unavatar.io/twitter/${handle}`,
    })
    .setTitle(`🆕 New Tweet from @${handle}`)
    .setURL(tweet.href)
    .setDescription(cleanText || "*No text*")
    .setTimestamp(new Date());
}

// ---------- MAIN ----------

async function main() {
  console.log("Bot started");

  // 🔥 GLOBAL TIMEOUT (prevents 13h freeze)
  setTimeout(() => {
    console.log("Force exit after 10 minutes");
    process.exit(1);
  }, 10 * 60 * 1000);

  const seen = loadSeen();
  const { browser, page } = await launchBrowser();

  const discord = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  await new Promise(resolve => discord.once("clientReady", resolve));

  console.log(`Discord ready: ${discord.user.tag}`);

  const channel = await discord.channels
    .fetch(CONFIG.NEWS_CHANNEL_ID)
    .catch(() => null);

  if (!channel) {
    console.error("Channel not found");
    process.exit(1);
  }

  let totalPosted = 0;

  console.log("Starting scan loop...");

  for (const handle of CONFIG.WATCH_ACCOUNTS) {
    const tweets = await fetchTweets(page, handle);

    if (!tweets.length) {
      await sleep(3000);
      continue;
    }

    if (!seen[handle]) {
      seen[handle] = tweets.map(t => t.id);
      console.log(`[${handle}] Seeded`);
      continue;
    }

    const seenSet = new Set(seen[handle]);
    const newTweets = tweets.filter(t => !seenSet.has(t.id));

    for (const tweet of [...newTweets].reverse()) {
      try {
        await channel.send({
          embeds: [buildEmbed(tweet, handle)],
        });

        seen[handle].unshift(tweet.id);
        totalPosted++;

        console.log(`[${handle}] Posted`);
        await sleep(1500);
      } catch (err) {
        console.error(`[${handle}] Send error:`, err.message);
      }
    }

    seen[handle] = seen[handle].slice(0, 50);

    await sleep(4000);
  }

  saveSeen(seen);

  console.log(`Done. Posted ${totalPosted}`);

  await browser.close();
  discord.destroy();
  process.exit(0);
}

// ---------- START ----------

const discord = new Client({
  intents: [GatewayIntentBits.Guilds],
});

discord.once("clientReady", () => main());
discord.login(CONFIG.DISCORD_TOKEN);