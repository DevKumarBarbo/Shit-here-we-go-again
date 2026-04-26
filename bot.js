const { Client, GatewayIntentBits } = require("discord.js");
const puppeteer = require("puppeteer");

const TOKEN = process.env.TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;

const ACCOUNTS = ["elonmusk"]; // add more usernames here

let seen = new Set();

const client = new Client({
  intents: [
      GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages
            ]
            });

            async function scrape(page, username) {
              await page.goto(`https://x.com/${username}`, {
                  waitUntil: "networkidle2"
                    });

                      await page.waitForSelector("article");

                        return await page.evaluate(() => {
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
                                                                                                          }

                                                                                                          async function send(channel, tweet, username) {
                                                                                                            try {
                                                                                                                const embed = {
                                                                                                                      author: {
                                                                                                                              name: `@${username}`,
                                                                                                                                      url: tweet.url
                                                                                                                                            },
                                                                                                                                                  description: tweet.text.substring(0, 4000),
                                                                                                                                                        url: tweet.url,
                                                                                                                                                              color: 0x000000,
                                                                                                                                                                    timestamp: new Date()
                                                                                                                                                                        };

                                                                                                                                                                            if (tweet.images.length > 0) {
                                                                                                                                                                                  embed.image = { url: tweet.images[0] };
                                                                                                                                                                                      }

                                                                                                                                                                                          if (tweet.videos.length > 0) {
                                                                                                                                                                                                embed.fields = [
                                                                                                                                                                                                        {
                                                                                                                                                                                                                  name: "Video",
                                                                                                                                                                                                                            value: tweet.videos[0]
                                                                                                                                                                                                                                    }
                                                                                                                                                                                                                                          ];
                                                                                                                                                                                                                                              }

                                                                                                                                                                                                                                                  await channel.send({ embeds: [embed] });

                                                                                                                                                                                                                                                      // extra images
                                                                                                                                                                                                                                                          for (let i = 1; i < tweet.images.length; i++) {
                                                                                                                                                                                                                                                                await channel.send({
                                                                                                                                                                                                                                                                        embeds: [{ image: { url: tweet.images[i] } }]
                                                                                                                                                                                                                                                                              });
                                                                                                                                                                                                                                                                                  }

                                                                                                                                                                                                                                                                                    } catch (err) {
                                                                                                                                                                                                                                                                                        console.log("Send error:", err.message);
                                                                                                                                                                                                                                                                                          }
                                                                                                                                                                                                                                                                                          }

                                                                                                                                                                                                                                                                                          async function startBot() {
                                                                                                                                                                                                                                                                                            const browser = await puppeteer.launch({
                                                                                                                                                                                                                                                                                                headless: true,
                                                                                                                                                                                                                                                                                                    args: ["--no-sandbox", "--disable-setuid-sandbox"]
                                                                                                                                                                                                                                                                                                      });

                                                                                                                                                                                                                                                                                                        const page = await browser.newPage();

                                                                                                                                                                                                                                                                                                          const channel = await client.channels.fetch(CHANNEL_ID);

                                                                                                                                                                                                                                                                                                            if (!channel) {
                                                                                                                                                                                                                                                                                                                console.log("Channel not found");
                                                                                                                                                                                                                                                                                                                    return;
                                                                                                                                                                                                                                                                                                                      }

                                                                                                                                                                                                                                                                                                                        console.log("Bot started...");

                                                                                                                                                                                                                                                                                                                          while (true) {
                                                                                                                                                                                                                                                                                                                              for (const user of ACCOUNTS) {
                                                                                                                                                                                                                                                                                                                                    const tweets = await scrape(page, user);

                                                                                                                                                                                                                                                                                                                                          for (const t of tweets) {
                                                                                                                                                                                                                                                                                                                                                  if (!t.url || seen.has(t.url)) continue;

                                                                                                                                                                                                                                                                                                                                                          seen.add(t.url);

                                                                                                                                                                                                                                                                                                                                                                  console.log("New tweet:", t.url);
                                                                                                                                                                                                                                                                                                                                                                          await send(channel, t, user);
                                                                                                                                                                                                                                                                                                                                                                                }
                                                                                                                                                                                                                                                                                                                                                                                    }

                                                                                                                                                                                                                                                                                                                                                                                        await new Promise(r => setTimeout(r, 4000));
                                                                                                                                                                                                                                                                                                                                                                                          }
                                                                                                                                                                                                                                                                                                                                                                                          }

                                                                                                                                                                                                                                                                                                                                                                                          client.once("ready", () => {
                                                                                                                                                                                                                                                                                                                                                                                            console.log(`Logged in as ${client.user.tag}`);
                                                                                                                                                                                                                                                                                                                                                                                              startBot();
                                                                                                                                                                                                                                                                                                                                                                                              });

                                                                                                                                                                                                                                                                                                                                                                                              client.login(TOKEN);