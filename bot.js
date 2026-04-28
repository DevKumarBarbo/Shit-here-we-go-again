const { chromium } = require("playwright");
const { Client, GatewayIntentBits, EmbedBuilder, WebhookClient } = require("discord.js");
const fs = require("fs");

const CONFIG = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  NEWS_CHANNEL_ID: process.env.NEWS_CHANNEL_ID,
  WATCH_ACCOUNTS: ["elonmusk", "NASA", "NVIDIAGeForce", "Intel", "Google", "YouTube", "HINDU_KlNG"],
  SEEN_FILE: "seen_ids.json",
};

// Account display names and colors for branding
const ACCOUNT_META = {
  elonmusk:     { name: "Elon Musk",       color: 0xe8e8e8, badge: "👤" },
  NASA:         { name: "NASA",             color: 0x0b3d91, badge: "🚀" },
  NVIDIAGeForce:{ name: "NVIDIA GeForce",  color: 0x76b900, badge: "🎮" },
  Intel:        { name: "Intel",            color: 0x0071c5, badge: "💻" },
  Google:       { name: "Google",           color: 0x4285f4, badge: "🔍" },
  YouTube:      { name: "YouTube",          color: 0xff0000, badge: "▶️" },
  HINDU_KlNG:   { name: "HINDU KlNG",      color: 0xff6600, badge: "👑" },
};

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

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function formatNumber(n) {
  if (!n || n === "0") return "0";
  const num = parseInt(n.replace(/[^0-9]/g, "")) || 0;
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "K";
  return num.toString();
}

function getPostTypeInfo(tweet) {
  if (tweet.isRepost)        return { label: "Repost",    icon: "🔁", color: 0x00c853, bar: "▰▰▰▰▰" };
  if (tweet.isReply)         return { label: "Reply",     icon: "💬", color: 0x1d9bf0, bar: "▰▰▰▰▰" };
  if (tweet.hasVideo)        return { label: "Video",     icon: "🎬", color: 0x9b59b6, bar: "▰▰▰▰▰" };
  if (tweet.gif)             return { label: "GIF",       icon: "🎞️", color: 0xe91e63, bar: "▰▰▰▰▰" };
  if (tweet.images.length>0) return { label: "Photo",     icon: "🖼️", color: 0xff6f00, bar: "▰▰▰▰▰" };
  return                            { label: "Post",      icon: "✍️", color: 0x14171a, bar: "▰▰▰▰▰" };
}

function buildEmbed(tweet, handle) {
  const meta = ACCOUNT_META[handle] || { name: `@${handle}`, color: 0x14171a, badge: "📢" };
  const typeInfo = getPostTypeInfo(tweet);
  const color = ACCOUNT_META[handle] ? meta.color : typeInfo.color;

  const tweetUrl = tweet.href || `https://x.com/${handle}/status/${tweet.id}`;
  const profileUrl = `https://x.com/${handle}`;
  const iconUrl = `https://unavatar.io/twitter/${handle}`;

  // Clean text
  const cleanText = tweet.text
    .replace(/https:\/\/t\.co\/\S+/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();

  // Format date
  const postDate = tweet.date ? new Date(tweet.date) : new Date();
  const dateFormatted = postDate.toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short"
  });

  // Media note
  const mediaLine = tweet.hasVideo
    ? `\n\n🎬 **[Click to watch video on X](${tweetUrl})**`
    : tweet.gif
    ? `\n\n🎞️ **[Click to view GIF on X](${tweetUrl})**`
    : "";

  // Build description with quote styling
  const bodyText = cleanText.length > 0
    ? cleanText + mediaLine
    : `*This post contains only media.*${mediaLine}`;

  // Engagement bar
  const likes    = formatNumber(tweet.likes);
  const reposts  = formatNumber(tweet.retweets);
  const replies  = formatNumber(tweet.replies);

  const embed = new EmbedBuilder()
    .setColor(color)
    .setAuthor({
      name: `${meta.badge} ${meta.name}  ·  @${handle}`,
      url: profileUrl,
      iconURL: iconUrl,
    })
    .setTitle(`${typeInfo.icon}  New ${typeInfo.label}`)
    .setURL(tweetUrl)
    .setDescription(bodyText.slice(0, 4096))
    .addFields(
      {
        name: "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
        value: `❤️  **${likes}** Likes   ·   🔁  **${reposts}** Reposts   ·   💬  **${replies}** Replies`,
        inline: false,
      },
      {
        name: "🕐  Published",
        value: dateFormatted,
        inline: false,
      },
      {
        name: "🔗  Direct Link",
        value: `**[→ Open Post on X](${tweetUrl})**`,
        inline: true,
      },
      {
        name: "👤  Profile",
        value: `**[→ View @${handle}](${profileUrl})**`,
        inline: true,
      },
    )
    .setTimestamp(postDate)
    .setFooter({
      text: `N.I.F. Private News Service  ·  Powered by 𝕏 Twitter/X`,
      iconURL: "https://abs.twimg.com/favicons/twitter.3.ico",
    });

  // Attach media
  const mediaUrl = tweet.images[0] || tweet.gif || tweet.videoPoster;
  if (mediaUrl) embed.setImage(mediaUrl);

  // Additional images
  if (tweet.images.length > 1) {
    embed.addFields({
      name: `🖼️  ${tweet.images.length} Images Attached`,
      value: tweet.images.slice(1, 4).map((_, i) => `[Image ${i + 2}](${tweetUrl})`).join("   ·   "),
      inline: false,
    });
  }

  return embed;
}

async function launchBrowser() {
  console.log("🚀 Launching browser...");
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  });
  console.log("✅ Browser ready");
  return { browser, page };
}

async function fetchTweets(page, handle) {
  try {
    await page.goto(`https://x.com/${handle}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await sleep(3000);
    await page.evaluate(() => window.scrollBy(0, 500));
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

          const likeEl    = article.querySelector('[data-testid="like"] span');
          const rtEl      = article.querySelector('[data-testid="retweet"] span');
          const replyEl   = article.querySelector('[data-testid="reply"] span');
          const socialCtx = article.querySelector('[data-testid="socialContext"]');
          const isRepost  = socialCtx ? socialCtx.innerText.toLowerCase().includes("repost") : false;
          const isReply   = text.startsWith("@");

          if (id) {
            results.push({
              id, text, href, date, images, gif, hasVideo, videoPoster,
              isRepost, isReply,
              likes:    likeEl  ? likeEl.innerText  : "0",
              retweets: rtEl    ? rtEl.innerText    : "0",
              replies:  replyEl ? replyEl.innerText : "0",
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

async function main() {
  const seen = loadSeen();
  const { browser, page } = await launchBrowser();

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
    if (!tweets.length) { await sleep(3000); continue; }

    if (!seen[handle]) {
      seen[handle] = tweets.map(t => t.id);
      console.log(`[${handle}] First run — seeded ${seen[handle].length}`);
      await sleep(3000);
      continue;
    }

    const seenSet   = new Set(seen[handle]);
    const newTweets = tweets.filter(t => !seenSet.has(t.id));

    if (newTweets.length === 0) {
      console.log(`[${handle}] No new posts`);
    } else {
      console.log(`[${handle}] ${newTweets.length} new posts!`);
      for (const tweet of [...newTweets].reverse()) {
        try {
          await channel.send({ embeds: [buildEmbed(tweet, handle)] });
          seen[handle].unshift(tweet.id);
          totalPosted++;
          console.log(`[${handle}] ✅ Posted: ${tweet.text.slice(0, 60)}`);
          await sleep(500);
        } catch (err) {
          console.error(`[${handle}] Send error: ${err.message}`);
        }
      }
      seen[handle] = seen[handle].slice(0, 50);
    }

    await sleep(3000);
  }

  saveSeen(seen);
  console.log(`\n✅ Done! Posted ${totalPosted} new posts.`);
  await browser.close();
  discord.destroy();
  process.exit(0);
}

const discord = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});
discord.once("clientReady", () => main());
discord.login(CONFIG.DISCORD_TOKEN);