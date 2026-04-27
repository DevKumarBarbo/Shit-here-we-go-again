const { chromium } = require("playwright");
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");

const CONFIG = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  NEWS_CHANNEL_ID: process.env.NEWS_CHANNEL_ID,
  TWITTER_USERNAME: process.env.TWITTER_USERNAME,
  TWITTER_PASSWORD: process.env.TWITTER_PASSWORD,
  WATCH_ACCOUNTS: ["elonmusk", "NASA", "NVIDIAGeForce", "Intel", "Google", "YouTube", "HINDU_KlNG"],
  POLL_INTERVAL_MS: 5 * 60 * 1000,
  DELAY_BETWEEN_ACCOUNTS: 10000,
  POST_ON_STARTUP: true,
};

const discord = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

const seenIds = {};
let browser, page;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

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
    await sleep(5000);
    await page.waitForSelector('input[autocomplete="username"]', { timeout: 20000 });
    await page.fill('input[autocomplete="username"]', CONFIG.TWITTER_USERNAME);
    await sleep(1000);
    await page.keyboard.press("Enter");
    await sleep(3000);
    const extra = await page.$('input[data-testid="ocfEnterTextTextInput"]');
    if (extra) {
      await extra.fill(CONFIG.TWITTER_USERNAME);
      await page.keyboard.press("Enter");
      await sleep(3000);
    }
    await page.waitForSelector('input[type="password"]', { timeout: 20000 });
    await page.fill('input[type="password"]', CONFIG.TWITTER_PASSWORD);
    await sleep(1000);
    await page.keyboard.press("Enter");
    await sleep(5000);
    console.log("Login attempt done");
  } catch (err) {
    console.log("Login failed, using public access:", err.message);
  }
}

async function fetchTweets(handle) {
  try {
    await page.goto(`https://x.com/${handle}/with_replies`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await sleep(4000);
    await page.evaluate(() => window.scrollBy(0, 400));
    await sleep(1000);

    const tweets = await page.evaluate(() => {
      const results = [];
      const articles = document.querySelectorAll('article[data-testid="tweet"]');

      for (const article of articles) {
        try {
          // Tweet text
          const textEl = article.querySelector('[data-testid="tweetText"]');
          const text = textEl ? textEl.innerText : "";

          // Tweet URL and ID
          const timeEl = article.querySelector("time");
          const linkEl = timeEl ? timeEl.closest("a") : null;
          const href = linkEl ? linkEl.href : "";
          const idMatch = href.match(/status\/(\d+)/);
          const id = idMatch ? idMatch[1] : null;
          const date = timeEl ? timeEl.getAttribute("datetime") : null;

          // Author (to detect reposts from others)
          const authorEl = article.querySelector('[data-testid="User-Name"] a');
          const authorHref = authorEl ? authorEl.href : "";
          const authorMatch = authorHref.match(/x\.com\/([^/]+)/);
          const author = authorMatch ? authorMatch[1] : "";

          // Images
          const images = [];
          article.querySelectorAll('[data-testid="tweetPhoto"] img').forEach(img => {
            if (img.src && !img.src.includes("profile")) images.push(img.src);
          });

          // GIF
          const gifEl = article.querySelector('[data-testid="tweetGif"] img') ||
                        article.querySelector('[data-testid="tweetGif"] video');
          const gif = gifEl ? (gifEl.src || gifEl.poster) : null;

          // Video
          const videoEl = article.querySelector('video');
          const video = videoEl ? (videoEl.poster || null) : null;
          const hasVideo = !!videoEl;

          // Engagement
          const likeEl = article.querySelector('[data-testid="like"] span');
          const rtEl = article.querySelector('[data-testid="retweet"] span');
          const replyEl = article.querySelector('[data-testid="reply"] span');
          const viewEl = article.querySelector('[data-testid="app-text-transition-container"] span');

          // Detect type
          const socialContext = article.querySelector('[data-testid="socialContext"]');
          const isRepost = socialContext ? socialContext.innerText.includes("reposted") : false;
          const isReply = text.startsWith("@");
          const isQuote = !!article.querySelector('[data-testid="tweet"] [data-testid="tweet"]');

          if (id) {
            results.push({
              id, text, href, date, author,
              images,
              gif,
              video,
              hasVideo,
              isRepost,
              isReply,
              isQuote,
              likes: likeEl ? likeEl.innerText : "0",
              retweets: rtEl ? rtEl.innerText : "0",
              replies: replyEl ? replyEl.innerText : "0",
              views: viewEl ? viewEl.innerText : "0",
            });
          }
        } catch (e) {}
      }
      return results;
    });

    console.log(`[${handle}] Found ${tweets.length} posts`);
    return tweets;
  } catch (err) {
    console.error(`[${handle}] Error: ${err.message}`);
    return [];
  }
}

function getPostType(tweet, handle) {
  if (tweet.isRepost && tweet.author.toLowerCase() !== handle.toLowerCase()) return "🔁 Repost";
  if (tweet.isReply) return "💬 Reply";
  if (tweet.isQuote) return "🗨️ Quote";
  if (tweet.hasVideo) return "🎥 Video Post";
  if (tweet.gif) return "🎞️ GIF Post";
  if (tweet.images.length > 0) return "🖼️ Image Post";
  return "📝 Post";
}

function getColor(tweet, handle) {
  if (tweet.isRepost) return 0x00b300;
  if (tweet.isReply) return 0x1d9bf0;
  if (tweet.isQuote) return 0xf4a500;
  if (tweet.hasVideo || tweet.gif) return 0x9b59b6;
  return 0x000000;
}

function buildEmbed(tweet, handle) {
  const cleanText = tweet.text.replace(/https:\/\/t\.co\/\S+/g, "").trim();
  const postType = getPostType(tweet, handle);
  const color = getColor(tweet, handle);
  const tweetUrl = tweet.href || `https://x.com/${handle}/status/${tweet.id}`;

  const mediaNote = tweet.hasVideo ? "\n\n`🎥 Video attached — view on X`" :
                    tweet.gif ? "\n\n`🎞️ GIF attached — view on X`" : "";

  const description = (cleanText.length > 0 ? cleanText : "*[Media only post]*") + mediaNote;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setAuthor({
      name: `@${handle}  ·  ${postType}`,
      url: `https://x.com/${handle}`,
      iconURL: `https://unavatar.io/twitter/${handle}`,
    })
    .setDescription(description.slice(0, 4096))
    .setURL(tweetUrl)
    .setTimestamp(tweet.date ? new Date(tweet.date) : new Date())
    .setFooter({ text: "𝕏  Twitter / X  ·  N.I.F. Private News Service" });

  // Add engagement fields
  embed.addFields(
    { name: "❤️ Likes", value: tweet.likes || "0", inline: true },
    { name: "🔁 Reposts", value: tweet.retweets || "0", inline: true },
    { name: "💬 Replies", value: tweet.replies || "0", inline: true },
  );

  // Attach image (first one if multiple)
  const mediaUrl = tweet.images[0] || tweet.gif || (tweet.hasVideo ? tweet.video : null);
  if (mediaUrl) embed.setImage(mediaUrl);

  // If multiple images add as fields
  if (tweet.images.length > 1) {
    embed.addFields({
      name: "🖼️ More Images",
      value: tweet.images.slice(1).map((_, i) => `[Image ${i + 2}](${tweet.href})`).join("  ·  "),
    });
  }

  return embed;
}

async function fetchAndPost(channel, handle, forcePost) {
  const tweets = await fetchTweets(handle);
  if (!tweets || tweets.length === 0) return;

  if (forcePost) {
    const latest = tweets[0];
    if (latest) {
      await channel.send({ embeds: [buildEmbed(latest, handle)] });
      console.log(`[${handle}] ✅ Startup post sent`);
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
  if (newTweets.length === 0) { console.log(`[${handle}] No new posts`); return; }

  for (const tweet of [...newTweets].reverse()) {
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

  console.log(`📡 Watching: ${CONFIG.WATCH_ACCOUNTS.map(h => "@" + h).join(", ")}`);

  for (const handle of CONFIG.WATCH_ACCOUNTS) {
    await fetchAndPost(channel, handle, CONFIG.POST_ON_STARTUP);
    await sleep(CONFIG.DELAY_BETWEEN_ACCOUNTS);
  }

  console.log("✅ Ready! Polling every 5 minutes...");

  setInterval(async () => {
    console.log("🔄 Polling...");
    for (const handle of CONFIG.WATCH_ACCOUNTS) {
      await fetchAndPost(channel, handle, false);
      await sleep(CONFIG.DELAY_BETWEEN_ACCOUNTS);
    }
  }, CONFIG.POLL_INTERVAL_MS);
});

discord.on("error", err => console.error("Discord error:", err));
discord.login(CONFIG.DISCORD_TOKEN);
