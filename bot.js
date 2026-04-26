const { chromium } = require("playwright");
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");

const CONFIG = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  NEWS_CHANNEL_ID: process.env.NEWS_CHANNEL_ID,
  TWITTER_USERNAME: process.env.TWITTER_USERNAME,
  TWITTER_PASSWORD: process.env.TWITTER_PASSWORD,
  WATCH_ACCOUNTS: ["HINDU_KlNG", "OpenAI", "NASA"],
  POLL_INTERVAL_MS: 5 * 60 * 1000, // 5 minutes
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
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
  console.log("Browser ready");
}

async function login() {
  console.log("Logging into X...");
  await page.goto("https://x.com/login", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  // Enter username
  await page.fill('input[autocomplete="username"]', CONFIG.TWITTER_USERNAME);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(2000);

  // Handle possible "enter phone/email" step
  const unusual = await page.$('input[data-testid="ocfEnterTextTextInput"]');
  if (unusual) {
    await unusual.fill(CONFIG.TWITTER_USERNAME);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(2000);
  }

  // Enter password
  await page.fill('input[type="password"]', CONFIG.TWITTER_PASSWORD);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(3000);

  console.log("Logged in!");
}

async function fetchTweets(handle) {
  try {
    await page.goto(`https://x.com/${handle}`, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(3000);

    const tweets = await page.evaluate(() => {
      const results = [];
      const articles = document.querySelectorAll('article[data-testid="tweet"]');

      for (const article of articles) {
        try {
          // Get tweet text
          const textEl = article.querySelector('[data-testid="tweetText"]');
          const text = textEl ? textEl.innerText : "";

          // Get tweet link/ID
          const timeEl = article.querySelector("time");
          const linkEl = timeEl ? timeEl.closest("a") : null;
          const href = linkEl ? linkEl.href : "";
          const idMatch = href.match(/status\/(\d+)/);
          const id = idMatch ? idMatch[1] : null;

          // Get image
          const imgEl = article.querySelector('[data-testid="tweetPhoto"] img');
          const image = imgEl ? imgEl.src : null;

          // Get stats
          const likeEl = article.querySelector('[data-testid="like"] span');
          const rtEl = article.querySelector('[data-testid="retweet"] span');
          const replyEl = article.querySelector('[data-testid="reply"] span');

          if (id && text) {
            results.push({
              id,
              text,
              image,
              likes: likeEl ? likeEl.innerText : "0",
              retweets: rtEl ? rtEl.innerText : "0",
              replies: replyEl ? replyEl.innerText : "0",
              url: href,
              is_retweet: text.startsWith("RT @"),
            });
          }
        } catch (e) {}
      }
      return results;
    });

    return tweets;
  } catch (err) {
    console.error(`[${handle}] Fetch error: ${err.message}`);
    return [];
  }
}

function buildEmbed(tweet, handle) {
  const embed = new EmbedBuilder()
    .setColor(0x000000)
    .setAuthor({ name: `@${handle}`, url: `https://x.com/${handle}` })
    .setDescription(tweet.text.slice(0, 4096))
    .setURL(tweet.url)
    .setFooter({ text: `𝕏 Post · @${handle}` })
    .addFields({
      name: "Engagement",
      value: `❤️ ${tweet.likes || 0}  🔁 ${tweet.retweets || 0}  💬 ${tweet.replies || 0}`,
    });
  if (tweet.image) embed.setImage(tweet.image);
  return embed;
}

async function fetchAndPost(channel, handle) {
  const tweets = await fetchTweets(handle);
  if (!tweets || tweets.length === 0) {
    console.log(`[${handle}] No tweets found`);
    return;
  }

  if (!seenIds[handle]) {
    seenIds[handle] = new Set(tweets.map((t) => t.id));
    console.log(`[${handle}] Seeded ${seenIds[handle].size} tweets`);
    return;
  }

  const newTweets = tweets.filter((t) => !seenIds[handle].has(t.id));
  console.log(`[${handle}] ${newTweets.length} new tweets`);

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
  console.log(`⏱️  Every ${CONFIG.POLL_INTERVAL_MS / 60000} minutes`);

  for (const handle of CONFIG.WATCH_ACCOUNTS) {
    await fetchAndPost(channel, handle);
  }

  setInterval(async () => {
    for (const handle of CONFIG.WATCH_ACCOUNTS) {
      await fetchAndPost(channel, handle);
    }
  }, CONFIG.POLL_INTERVAL_MS);
});

discord.on("error", (err) => console.error("Discord error:", err));
discord.login(CONFIG.DISCORD_TOKEN);
