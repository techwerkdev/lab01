import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { connect } from 'puppeteer-real-browser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OT_CHANNELS_FILE_PATH = path.resolve(__dirname, '../sources/mkchannels.json');
const M3U_FILE_PATH = path.resolve(__dirname, '../output m3u/network_requestsMK.m3u');

async function readJsonFile(filePath) {
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`❌ Error reading ${filePath}:`, error);
    return [];
  }
}

async function processMKChannels() {
  // Ова е замена за chromium.launch
  const { browser, page } = await connect({
    headless: 'auto',
    args: [],
    customConfig: {},
    skipTarget: [],
    fingerprint: true,
    turnstile: true,
    connectOption: {},
    // proxy: {
    //   host: '<proxy-host>',
    //   port: '<proxy-port>',
    //   username: '<proxy-username>',
    //   password: '<proxy-password>',
    // }
  });

  try {
    const channels = await readJsonFile(OT_CHANNELS_FILE_PATH);

    for (const channel of channels) {
      console.log(`🔍 Processing channel: ${channel.name}`);

      let playurl = await extractPlayUrl(page, channel);
      if (playurl) {
        channel.playurl = playurl;
        console.log(`✅ Found playurl: ${playurl}`);

        const m3uContent = `#EXTINF:-1 tvg-id="${channel.id}" tvg-name="${channel.name}", ${channel.name}\n${playurl}\n`;
        await fs.appendFile(M3U_FILE_PATH, m3uContent, 'utf8');
      }
    }
  } catch (error) {
    console.error('❌ Error processing channels:', error);
  } finally {
    await browser.close();
  }
}

async function extractPlayUrl(page, channel) {
  let playurl = null;
  const urlCounts = {}; // ќе броиме колку пати се појавува секој линк

  try {
    console.log(`🌐 Navigating to: ${channel.url}`);

    page.removeAllListeners('response'); // чистиме евентуални стари слушатели

    // Слушаме за .m3u8 во response-ите
    page.on('response', (response) => {
      const url = response.url();
      if (url.includes('.m3u8')) {
        urlCounts[url] = (urlCounts[url] || 0) + 1;
        console.log(`🎯 Found .m3u8 for ${channel.name}: ${url} (count: ${urlCounts[url]})`);

        // ако истиот линк се појави барем 3 пати -> го прифаќаме
        if (urlCounts[url] >= 3 && !playurl) {
          playurl = url;
        }
      }
    });

    await page.goto(channel.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Чекај максимум 20 секунди за линк
    const start = Date.now();
    while (!playurl && Date.now() - start < 20000) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (playurl) return playurl;

    // Ако нема линк сними screenshot
    const safeName = channel.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const screenshotPath = path.resolve(__dirname, `../screenshots/missing-${safeName}.png`);
    await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.warn(`⚠️ No stream found for ${channel.name}, screenshot saved.`);
    return null;
  } catch (err) {
    console.error(`❌ Error extracting playurl for ${channel.name}:`, err);
    return null;
  }
}


export default processMKChannels;
