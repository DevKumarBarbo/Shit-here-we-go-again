const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const puppeteer = require("puppeteer");

const TOKEN = process.env.TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;

const ACCOUNTS = ["elonmusk"]; // add more

const seen = new Set();

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
  });

  async function scrapeTweets(page, username) {
    await page.goto(`https://x.com/${username}`, {
        waitUntil: "networkidle2"
          });

            await page.waitForSelector("article");

              const tweets = await page.evaluate(() => {
                  const articles = document.querySelectorAll("article");

                      return Array.from(articles).map(a => {
                            const text = a.innerText;

                                  const linkEl = a.querySelector("a[href*='/status/']");
                                        const url = linkEl ? linkEl.href : null;

                                              const images = Array.from(a.querySelectorAll("img"))
                                                      .map(i => i.src)
                                                              .filter(src => src.includes("media"));

                                                                    const videos = Array.from(a.querySelectorAll("video"))
                                                                            .map(v => v.src)
                                                                                    .filter(Boolean);

                                                                                          return { text, url, images, videos };
                                                                                              });
                                                                                                });

                                                                                                  return tweets;
                                                                                                  }

                                                                                                  async function sendTweet(channel, tweet, username) {
                                                                                                    const embed = new EmbedBuilder()
                                                                                                        .setAuthor({ name: `@${username}`, url: tweet.url })
                                                                                                            .setDescription(tweet.text.slice(0, 4000))
                                                                                                                .setURL(tweet.url)
                                                                                                                    .setColor(0x000000)
                                                                                                                        .setTimestamp();

                                                                                                                          if (tweet.images.length > 0) {
                                                                                                                              embed.setImage(tweet.images[0]);
                                                                                                                                }

                                                                                                                                  if (tweet.videos.length > 0) {
                                                                                                                                      embed.addFields({
                                                                                                                                            name: "Video",
                                                                                                                                                  value: tweet.videos[0]
                                                                                                                                                      });
                                                                                                                                                        }

                                                                                                                                                          await channel.send({ embeds: [embed] });

                                                                                                                                                            // extra images
                                                                                                                                                              for (let i = 1; i < tweet.images.length; i++) {
                                                                                                                                                                  await channel.send({
                                                                                                                                                                        embeds: [new EmbedBuilder().setImage(tweet.images[i])]
                                                                                                                                                                            });
                                                                                                                                                                              }
                                                                                                                                                                              }

                                                                                                                                                                              async function start() {
                                                                                                                                                                                const browser = await puppeteer.launch({
                                                                                                                                                                                    headless: true,
                                                                                                                                                                                        args: ["--no-sandbox", "--disable-setuid-sandbox"]
                                                                                                                                                                                          });

                                                                                                                                                                                            const page = await browser.newPage();
                                                                                                                                                                                              const channel = await client.channels.fetch(CHANNEL_ID);

                                                                                                                                                                                                console.log("PRO bot started 🚀");

                                                                                                                                                                                                  while (true) {
                                                                                                                                                                                                      for (const user of ACCOUNTS) {
                                                                                                                                                                                                            const tweets = await scrapeTweets(page, user);

                                                                                                                                                                                                                  for (const t of tweets) {
                                                                                                                                                                                                                          if (!t.url || seen.has(t.url)) continue;

                                                                                                                                                                                                                                  seen.add(t.url);

                                                                                                                                                                                                                                          console.log("New tweet:", t.url);
                                                                                                                                                                                                                                                  await sendTweet(channel, t, user);
                                                                                                                                                                                                                                                        }
                                                                                                                                                                                                                                                            }

                                                                                                                                                                                                                                                                await new Promise(r => setTimeout(r, 2000)); // fast check
                                                                                                                                                                                                                                                                  }
                                                                                                                                                                                                                                                                  }

                                                                                                                                                                                                                                                                  client.once("ready", () => {
                                                                                                                                                                                                                                                                    console.log(`Logged in as ${client.user.tag}`);
                                                                                                                                                                                                                                                                      start();
                                                                                                                                                                                                                                                                      });

                                                                                                                                                                                                                                                                      client.login(TOKEN);const