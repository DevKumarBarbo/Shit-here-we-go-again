const { chromium } = require("playwright");
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");

const CONFIG = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  NEWS_CHANNEL_ID: process.env.NEWS_CHANNEL_ID,
  TWITTER_USERNAME: process.env.TWITTER_USERNAME,
  TWITTER_PASSWORD: process.env.TWITTER_PASSWORD,
  WATCH_ACCOUNTS: ["elonmusk", "NASA", "NVIDIAGeForce", "Intel", "Google", "YouTube", "HINDU_KlNG"],
  POLL_INTERVAL_MS: 5 * 60 * 1000,
  POST_ON_STARTUP: true, // posts latest tweet from each account on startup to confirm working
};

const discord = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

const seenIds = {};
let browser, page;

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
  console.log("Logging into X...");
  try {
    await page.goto("https://x.com/login", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(5000);
    await page.waitForSelector('input[autocomplete="username"]', { timeout: 20000 });
    await page.fill('input[autocomplete="username"]', CONFIG.TWITTER_USERNAME);
    await page.waitForTimeout(1000);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(3000);
    const extra = await page.$('input[data-testid="ocfEnterTextTextInput"]');
    if (extra) {
      await extra.fill(CONFIG.TWITTER_USERNAME);
      await page.keyboard.press("Enter");
      await page.waitForTimeout(3000);
    }
    await page.waitForSelector('input[type="password"]', { timeout: 20000 });
    await page.fill('input[type="password"]', CONFIG.TWITTER_PASSWORD);
    await page.waitForTimeout(1000);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(5000);
    console.log("Login attempt done");
  } catch (err) {
    console.log("Login failed, continuing with public access:", err.message);
  }
}

async function fetchTweets(handle) {
  try {
    await page.goto(`https://x.com/${handle}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(4000);
    await page.evaluate(() => window.scrollBy(0, 300));
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
  const cleanText = tweet.text.replace(/https:\/\/t\.co\/\S+/g, "").trim();
  const embed = new EmbedBuilder()
    .setColor(0x1a1a2e)
    .setAuthor({
      name: `@${handle}`,
      url: `https://x.com/${handle}`,
      iconURL: `https://unavatar.io/twitter/${handle}`,
    })
    .setDescription(cleanText.length > 0 ? cleanText.slice(0, 4096) : "*[Media post]*")
    .setURL(tweet.url)
    .setTimestamp(tweet.date ? new Date(tweet.date) : new Date())
    .setFooter({ text: "𝕏 Twitter/X" })
    .addFields({
      name: "📊 Engagement",
      value: `❤️ **${tweet.likes}** · 🔁 **${tweet.retweets}** · 💬 **${tweet.replies}**`,
    });
  if (tweet.image) embed.setImage(tweet.image);
  return embed;
}

async function fetchAndPost(channel, handle, forcePost) {
  const tweets = await fetchTweets(handle);
  if (!tweets || tweets.length === 0) return;

  // On startup with forcePost: post the latest tweet to confirm working
  if (forcePost) {
    const latest = tweets.find(t => !t.is_retweet);
    if (latest) {
      await channel.send({ content: `✅ Bot connected! Latest post from **@${handle}**:`, embeds: [buildEmbed(latest, handle)] });
      console.log(`[${handle}] ✅ Test post sent!`);
    }
    seenIds[handle] = new Set(tweets.map(t => t.id));
    return;
  }

  if (!seenIds[handle]) {
    seenIds[handle] = new Set(tweets.map(t => t.id));
    console.log(`[${handle}] Seeded ${seenIds[handle].size}`);
    return;
  }

  const newTweets = tweets.filter(t => !seenIds[handle].has(t.id));
  if (newTweets.length === 0) { console.log(`[${handle}] No new tweets`); return; }

  for (const tweet of [...newTweets].reverse()) {
    if (tweet.is_retweet) continue;
    await channel.send({ embeds: [buildEmbed(tweet, handle)] });
    seenIds[handle].add(tweet.id);
    console.log(`[${handle}] ✅ Posted: ${tweet.text.slice(0, 50)}`);
  }
}

discord.once("clientReady", async () => {
  console.log(`✅ Bot online: ${discord.user.tag}`);
  const channel = await discord.channels.fetch(CONFIG.NEWS_CHANNEL_ID).catch(() => null);
  if (!channel) { console.error("❌ Channel not found"); process.exit(1); }

  await launchBrowser();
  await login();

  console.log(`📡 Watching: ${CONFIG.WATCH_ACCOUNTS.map(h => "@" + h).join(", ")}`);

  // Post latest tweet from each account on startup to confirm working
  for (const handle of CONFIG.WATCH_ACCOUNTS) {
    await fetchAndPost(channel, handle, CONFIG.POST_ON_STARTUP);
  }

  console.log("✅ Startup done! Polling every 5 minutes...");

  setInterval(async () => {
    console.log("🔄 Polling...");
    for (const handle of CONFIG.WATCH_ACCOUNTS) {
      await fetchAndPost(channel, handle, false);
    }
  }, CONFIG.POLL_INTERVAL_MS);
});

discord.on("error", err => console.error("Discord error:", err));
discord.login(CONFIG.DISCORD_TOKEN);
