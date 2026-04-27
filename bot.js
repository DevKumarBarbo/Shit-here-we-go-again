const { chromium } = require("playwright");
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const fs = require("fs");

const CONFIG = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  NEWS_CHANNEL_ID: process.env.NEWS_CHANNEL_ID,
  TWITTER_USERNAME: process.env.TWITTER_USERNAME,
  TWITTER_PASSWORD: process.env.TWITTER_PASSWORD,
  WATCH_ACCOUNTS: ["elonmusk", "HINDU_KlNG"],
  SEEN_FILE: "seen_ids.json",
};

// ── Seen IDs (persisted via GitHub Actions cache) ──────────────
function loadSeen() {
  try {
    if (fs.existsSync(CONFIG.SEEN_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG.SEEN_FILE, "utf8"));
    }
  } catch (e) {}
  return {};
}

function saveSeen(seen) {
  fs.writeFileSync(CONFIG.SEEN_FILE, JSON.stringify(seen, null, 2));
}

// ── Browser ────────────────────────────────────────────────────
async function launchBrowser() {
  console.log("🚀 Launching browser...");
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  const page = await browser.newPage();
  console.log("✅ Browser ready");
  return { browser, page };
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Login ──────────────────────────────────────────────────────
async function login(page) {
  console.log("🔐 Logging into X...");
  try {
    await page.goto("https://x.com/login", { waitUntil: "domcontentloaded", timeout: 60000 });
    await sleep(4000);
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
    console.log("✅ Logged in!");
  } catch (err) {
    console.log("⚠️ Login failed, using public access");
  }
}

// ── Fetch Tweets ───────────────────────────────────────────────
async function fetchTweets(page, handle) {
  try {
    await page.goto(`https://x.com/${handle}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await sleep(4000);
    await page.evaluate(() => window.scrollBy(0, 400));
    await sleep(1000);

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
          const date = timeEl ? timeEl.getAttribute("datetime") : null;

          // Media
          const images = [];
          article.querySelectorAll('[data-testid="tweetPhoto"] img').forEach(img => {
            if (img.src && !img.src.includes("profile")) images.push(img.src);
          });
          const gifEl = article.querySelector('[data-testid="tweetGif"] img') ||
                        article.querySelector('[data-testid="tweetGif"] video');
          const gif = gifEl ? (gifEl.src || gifEl.poster) : null;
          const videoEl = article.querySelector('video');
          const hasVideo = !!videoEl;
          const videoPoster = videoEl ? videoEl.poster : null;

          // Engagement
          const likeEl = article.querySelector('[data-testid="like"] span');
          const rtEl = article.querySelector('[data-testid="retweet"] span');
          const replyEl = article.querySelector('[data-testid="reply"] span');

          // Type detection
          const socialCtx = article.querySelector('[data-testid="socialContext"]');
          const isRepost = socialCtx ? socialCtx.innerText.toLowerCase().includes("repost") : false;
          const isReply = text.startsWith("@");

          if (id) {
            results.push({
              id, text, href, date, images, gif, hasVideo, videoPoster,
              isRepost, isReply,
              likes: likeEl ? likeEl.innerText : "0",
              retweets: rtEl ? rtEl.innerText : "0",
              replies: replyEl ? replyEl.innerText : "0",
            });
          }
        } catch (e) {}
      }
      return results;
    });

    console.log(`[${handle}] Found ${tweets.length} posts`);
    return tweets;
  } catch (err) {
    console.error(`[${handle}] Fetch error: ${err.message}`);
    return [];
  }
}

// ── Build Embed ────────────────────────────────────────────────
function buildEmbed(tweet, handle) {
  const cleanText = tweet.text.replace(/https:\/\/t\.co\/\S+/g, "").trim();

  // Post type
  let postType, postIcon, color;
  if (tweet.isRepost) {
    postType = "Repost"; postIcon = "🔁"; color = 0x00c853;
  } else if (tweet.isReply) {
    postType = "Reply"; postIcon = "💬"; color = 0x1d9bf0;
  } else if (tweet.hasVideo) {
    postType = "Video"; postIcon = "🎥"; color = 0x9b59b6;
  } else if (tweet.gif) {
    postType = "GIF"; postIcon = "🎞️"; color = 0xe91e63;
  } else if (tweet.images.length > 0) {
    postType = "Photo"; postIcon = "🖼️"; color = 0xff6f00;
  } else {
    postType = "Post"; postIcon = "📝"; color = 0x14171a;
  }

  const tweetUrl = tweet.href || `https://x.com/${handle}/status/${tweet.id}`;

  // Format date nicely
  const dateStr = tweet.date
    ? new Date(tweet.date).toUTCString().replace(" GMT", " UTC")
    : new Date().toUTCString();

  // Media note for video/gif
  const mediaNote = tweet.hasVideo
    ? "\n\n> 🎥 **This post contains a video** — [Watch on X](" + tweetUrl + ")"
    : tweet.gif
    ? "\n\n> 🎞️ **This post contains a GIF** — [View on X](" + tweetUrl + ")"
    : "";

  const description = (cleanText.length > 0 ? cleanText : "*This post contains only media.*") + mediaNote;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setAuthor({
      name: `@${handle}`,
      url: `https://x.com/${handle}`,
      iconURL: `https://unavatar.io/twitter/${handle}`,
    })
    .setTitle(`${postIcon} New ${postType} from @${handle}`)
    .setURL(tweetUrl)
    .setDescription(description.slice(0, 4096))
    .addFields(
      { name: "❤️ Likes", value: `**${tweet.likes || "0"}**`, inline: true },
      { name: "🔁 Reposts", value: `**${tweet.retweets || "0"}**`, inline: true },
      { name: "💬 Replies", value: `**${tweet.replies || "0"}**`, inline: true },
      { name: "🔗 View Post", value: `[Open on X ↗](${tweetUrl})`, inline: true },
      { name: "📅 Posted", value: dateStr, inline: false },
    )
    .setTimestamp(tweet.date ? new Date(tweet.date) : new Date())
    .setFooter({
      text: "N.I.F. Private News Service  ·  𝕏 Twitter/X",
      iconURL: "https://abs.twimg.com/favicons/twitter.3.ico",
    });

  // Attach media
  const mediaUrl = tweet.images[0] || tweet.gif || tweet.videoPoster;
  if (mediaUrl) embed.setImage(mediaUrl);

  // Extra images as links
  if (tweet.images.length > 1) {
    embed.addFields({
      name: "🖼️ Additional Images",
      value: tweet.images.slice(1, 4).map((_, i) => `[Image ${i + 2}](${tweetUrl})`).join("  ·  "),
    });
  }

  return embed;
}

// ── Main ───────────────────────────────────────────────────────
async function main() {
  const seen = loadSeen();
  const { browser, page } = await launchBrowser();
  await login(page);

  const discord = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  });

  await new Promise(resolve => discord.once("clientReady", resolve));
  console.log(`✅ Discord: ${discord.user.tag}`);

  const channel = await discord.channels.fetch(CONFIG.NEWS_CHANNEL_ID).catch(() => null);
  if (!channel) { console.error("❌ Channel not found"); process.exit(1); }

  let totalPosted = 0;

  for (const handle of CONFIG.WATCH_ACCOUNTS) {
    const tweets = await fetchTweets(page, handle);
    if (!tweets.length) { await sleep(5000); continue; }

    if (!seen[handle]) {
      seen[handle] = tweets.map(t => t.id);
      console.log(`[${handle}] First run — seeded ${seen[handle].length} posts`);
      await sleep(8000);
      continue;
    }

    const seenSet = new Set(seen[handle]);
    const newTweets = tweets.filter(t => !seenSet.has(t.id));

    if (newTweets.length === 0) {
      console.log(`[${handle}] No new posts`);
    } else {
      for (const tweet of [...newTweets].reverse()) {
        try {
          await channel.send({ embeds: [buildEmbed(tweet, handle)] });
          seen[handle].unshift(tweet.id);
          totalPosted++;
          console.log(`[${handle}] ✅ Posted: ${tweet.text.slice(0, 50)}`);
          await sleep(1000);
        } catch (err) {
          console.error(`[${handle}] Send error: ${err.message}`);
        }
      }
      // Keep only last 50 IDs per account
      seen[handle] = seen[handle].slice(0, 50);
    }

    await sleep(8000);
  }

  saveSeen(seen);
  console.log(`\n✅ Done! Posted ${totalPosted} new tweets.`);

  await browser.close();
  discord.destroy();
  process.exit(0);
}

const discord = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});
discord.once("clientReady", () => main());
discord.login(CONFIG.DISCORD_TOKEN);
