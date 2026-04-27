const { chromium } = require("playwright");
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");

const CONFIG = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  NEWS_CHANNEL_ID: process.env.NEWS_CHANNEL_ID,
  TWITTER_USERNAME: process.env.TWITTER_USERNAME,
  TWITTER_PASSWORD: process.env.TWITTER_PASSWORD,
  WATCH_ACCOUNTS: ["elonmusk", "NASA", "NVIDIAGeForce", "Intel", "Google", "YouTube", "HINDU_KlNG"],
  POLL_INTERVAL_MS: 5 * 60 * 1000,
};

const discord = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

const seenIds = {};
let browser, page;
let isLoggedIn = false;

async function launchBrowser() {
  console.log("Launching browser...");
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  page = await browser.newPage();
  console.log("Browser ready");
}

async function login() {
  if (isLoggedIn) return;
  console.log("Logging into X...");
  try {
    await page.goto("https://x.com/login", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(5000);

    // Type username
    await page.waitForSelector('input[autocomplete="username"]', { timeout: 20000 });
    await page.fill('input[autocomplete="username"]', CONFIG.TWITTER_USERNAME);
    await page.waitForTimeout(1000);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(3000);

    // Handle phone/email verification step
    const extra = await page.$('input[data-testid="ocfEnterTextTextInput"]');
    if (extra) {
      console.log("Extra verification needed...");
      await extra.fill(CONFIG.TWITTER_USERNAME);
      await page.keyboard.press("Enter");
      await page.waitForTimeout(3000);
    }

    // Type password
    await page.waitForSelector('input[type="password"]', { timeout: 20000 });
    await page.fill('input[type="password"]', CONFIG.TWITTER_PASSWORD);
    await page.waitForTimeout(1000);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(5000);

    // Check if logged in
    const url = page.url();
    if (url.includes("home") || url.includes("x.com/") && !url.includes("login")) {
      isLoggedIn = true;
      console.log("✅ Logged in successfully!");
    } else {
      console.log("⚠️ Login may have failed, continuing anyway...");
    }
  } catch (err) {
    console.error("Login error:", err.message);
    console.log("Continuing without login - public tweets still visible");
  }
}

async function fetchTweets(handle) {
  try {
    await page.goto(`https://x.com/${handle}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(4000);

    // Scroll a bit to load more tweets
    await page.evaluate(() => window.scrollBy(0, 500));
    await page.waitForTimeout(1000);

    const tweets = await page.evaluate(() => {
      const results = [];
      const articles = document.querySelectorAll('article[data-testid="tweet"]');
      for (const article of articles) {
        try {
          const textEl = article.querySelector('[data-testid="tweetText"]');
          const text = textEl ? textEl.innerText : "";
          const timeEl = article.querySelector("time");
          const linkEl = timeEl ? timeEl.closest("a") : null;
          const href = linkEl ? linkEl.href : "";
          const idMatch = href.match(/status\/(\d+)/);
          const id = idMatch ? idMatch[1] : null;
          const imgEl = article.querySelector('[data-testid="tweetPhoto"] img');
          const image = imgEl ? imgEl.src : null;
          const likeEl = article.querySelector('[data-testid="like"] span');
          const rtEl = article.querySelector('[data-testid="retweet"] span');
          const replyEl = article.querySelector('[data-testid="reply"] span');
          const timeAttr = timeEl ? timeEl.getAttribute("datetime") : null;
          if (id && text) {
            results.push({
              id, text, image,
              likes: likeEl ? likeEl.innerText : "0",
              retweets: rtEl ? rtEl.innerText : "0",
              replies: replyEl ? replyEl.innerText : "0",
              url: href,
              date: timeAttr,
              is_retweet: text.startsWith("RT @"),
            });
          }
        } catch (e) {}
      }
      return results;
    });

    console.log(`[${handle}] Found ${tweets.length} tweets`);
    return tweets;
  } catch (err) {
    console.error(`[${handle}] Error: ${err.message}`);
    return [];
  }
}

function buildEmbed(tweet, handle) {
  // Clean up tweet text - remove t.co links at end
  const cleanText = tweet.text.replace(/https:\/\/t\.co\/\S+/g, "").trim();

  const embed = new EmbedBuilder()
    .setColor(0x1a1a2e)
    .setAuthor({
      name: `@${handle}`,
      url: `https://x.com/${handle}`,
      iconURL: `https://unavatar.io/twitter/${handle}`,
    })
    .setDescription(cleanText.length > 0 ? cleanText.slice(0, 4096) : "*[Media/Link post]*")
    .setURL(tweet.url)
    .setTimestamp(tweet.date ? new Date(tweet.date) : new Date())
    .setFooter({ text: "𝕏  Twitter/X" })
    .addFields({
      name: "📊 Engagement",
      value: `❤️ **${tweet.likes}** Likes  ·  🔁 **${tweet.retweets}** Retweets  ·  💬 **${tweet.replies}** Replies`,
      inline: false,
    });

  if (tweet.image) embed.setImage(tweet.image);

  return embed;
}

async function fetchAndPost(channel, handle) {
  const tweets = await fetchTweets(handle);
  if (!tweets || tweets.length === 0) return;

  if (false) {
    seenIds[handle] = new Set(tweets.map((t) => t.id));
    console.log(`[${handle}] Seeded ${seenIds[handle].size} tweets`);
    return;
  }

  const newTweets = tweets.filter((t) => !seenIds[handle].has(t.id));
  if (newTweets.length === 0) {
    console.log(`[${handle}] No new tweets`);
    return;
  }

  console.log(`[${handle}] ${newTweets.length} new tweets!`);

  for (const tweet of [...newTweets].reverse()) {
    if (tweet.is_retweet) continue;
    try {
      await channel.send({ embeds: [buildEmbed(tweet, handle)] });
      seenIds[handle].add(tweet.id);
      console.log(`[${handle}] ✅ Posted: ${tweet.text.slice(0, 50)}`);
    } catch (err) {
      console.error(`[${handle}] Send error: ${err.message}`);
    }
  }
}

discord.once("clientReady", async () => {
  console.log(`✅ Bot online: ${discord.user.tag}`);
  const channel = await discord.channels.fetch(CONFIG.NEWS_CHANNEL_ID).catch(() => null);
  if (!channel) { console.error("❌ Channel not found"); process.exit(1); }

  await launchBrowser();
  await login();

  console.log(`📡 Watching: ${CONFIG.WATCH_ACCOUNTS.map((h) => "@" + h).join(", ")}`);

  // Seed all accounts
  for (const handle of CONFIG.WATCH_ACCOUNTS) {
    await fetchAndPost(channel, handle);
  }

  console.log(`✅ Ready! Polling every ${CONFIG.POLL_INTERVAL_MS / 60000} minutes`);

  // Poll forever
  setInterval(async () => {
    console.log(`🔄 Polling...`);
    for (const handle of CONFIG.WATCH_ACCOUNTS) {
      await fetchAndPost(channel, handle);
    }
  }, CONFIG.POLL_INTERVAL_MS);
});

discord.on("error", (err) => console.error("Discord error:", err));
discord.login(CONFIG.DISCORD_TOKEN);
