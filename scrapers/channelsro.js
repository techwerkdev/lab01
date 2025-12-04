import { chromium } from 'playwright';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OT_CHANNELS_FILE_PATH = path.resolve(__dirname, '../sources/rochannels.json');
const M3U_FILE_PATH = path.resolve(__dirname, '../output m3u/network_requestsRO.m3u');

async function readJsonFile(filePath) {
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`❌ Error reading ${filePath}:`, error);
    return [];
  }
}

async function processROChannels() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, како Gecko) Chrome/115.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();
  try {
    const channels = await readJsonFile(OT_CHANNELS_FILE_PATH);

    for (const channel of channels) {
      console.log(`🔍 Processing channel: ${channel.name}`);

      let playurl = await extractPlayUrl(page, channel);
      if (playurl) {
        channel.playurl = playurl;
        console.log(`✅ Found playurl: ${playurl}`);

        const m3uContent = `#EXTINF:-1 tvg-id="${channel.id}" tvg-name="${channel.name}",${channel.name}\n${playurl}\n`;
        await fs.appendFile(M3U_FILE_PATH, m3uContent, 'utf8');
      } else {
        console.warn(`⚠️ No playurl found for ${channel.name}`);
      }
    }
  } catch (error) {
    console.error('❌ Error processing channels:', error);
  } finally {
    await browser.close();
  }
}

async function extractPlayUrl(page, channel) {
  try {
    console.log(`🌐 Visiting: ${channel.url}`);
    let playurl = null;

    page.removeAllListeners('request');

    page.on('request', request => {
      if (
        (request.resourceType() === 'xhr' || request.resourceType() === 'fetch') &&
        request.url().includes('.m3u8')
      ) {
        playurl = request.url();
        console.log(`🎯 Detected .m3u8 link: ${playurl}`);
      }
    });

    await page.goto(channel.url, { waitUntil: 'domcontentloaded' });

    // Прв клик на селектор од каналот
    if (channel.clickSelector) {
      try {
        await page.waitForSelector(channel.clickSelector, { timeout: 8000 });
        await page.click(channel.clickSelector);
        console.log(`🖱️ Clicked selector: ${channel.clickSelector}`);

        const clickScreenshotPath = path.resolve(__dirname, `../output m3u/screenshots/${channel.name.replace(/\s+/g, '_')}_after_first_click.png`);
        await fs.mkdir(path.dirname(clickScreenshotPath), { recursive: true });
        await page.screenshot({ path: clickScreenshotPath, fullPage: true });
        console.log(`📸 Screenshot after first click saved: ${clickScreenshotPath}`);
      } catch {
        console.warn(`⚠️ Selector not found or not clickable: ${channel.clickSelector}`);
      }
    }

    // Втор клик на фиксен селектор
    const secondClickSelector = '#my-video > button > span.vjs-icon-placeholder';
    try {
      await page.waitForSelector(secondClickSelector, { timeout: 8000 });
      await page.click(secondClickSelector);
      console.log(`🖱️ Clicked second selector: ${secondClickSelector}`);

      const secondClickScreenshotPath = path.resolve(__dirname, `../output m3u/screenshots/${channel.name.replace(/\s+/g, '_')}_after_second_click.png`);
      await fs.mkdir(path.dirname(secondClickScreenshotPath), { recursive: true });
      await page.screenshot({ path: secondClickScreenshotPath, fullPage: true });
      console.log(`📸 Screenshot after second click saved: ${secondClickScreenshotPath}`);
    } catch {
      console.warn(`⚠️ Second selector not found or not clickable: ${secondClickSelector}`);
    }

    // Отстранување потенцијални скрипти што блокираат scrape
    await page.evaluate(() => {
      const badScripts = [...document.querySelectorAll('script')]
        .filter(s => s.innerText.includes('devtools') || s.hasAttribute('disable-devtool.min'));
      badScripts.forEach(s => s.remove());
    });

    // Чекаме да најдеме .m3u8
    const maxWaitTime = 15000;
    const checkInterval = 2000;
    let waited = 0;

    while (!playurl && waited < maxWaitTime) {
      await new Promise(r => setTimeout(r, checkInterval));
      waited += checkInterval;
    }

    // Скриншот ако не најдеме .m3u8
    if (!playurl) {
      const failScreenshotPath = path.resolve(__dirname, `../output m3u/screenshots/${channel.name.replace(/\s+/g, '_')}_no_m3u8.png`);
      await fs.mkdir(path.dirname(failScreenshotPath), { recursive: true });
      await page.screenshot({ path: failScreenshotPath, fullPage: true });
      console.warn(`📸 Screenshot (no m3u8) saved: ${failScreenshotPath}`);
    }

    return playurl;
  } catch (error) {
    console.error(`❌ Error extracting playurl for ${channel.name}:`, error);
    return null;
  }
}




export default processROChannels;
