import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BU_CHANNELS_FILE_PATH = path.resolve(__dirname, '../sources/atchannels.json');
const M3U_FILE_PATH = path.resolve(__dirname, '../output m3u/network_requestsAT.m3u');

async function readJsonFile(filePath) {
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`❌ Error reading ${filePath}:`, error);
    return [];
  }
}

async function processATChannels() {
    let browser;
    try {
      const channels = await readJsonFile(BU_CHANNELS_FILE_PATH);
      puppeteer.use(StealthPlugin());
      browser = await puppeteer.launch({
        headless: true,
        protocolTimeout: 60000,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });     
       const page = await browser.newPage();
  
      for (const channel of channels) {
        console.log(`🔍 Processing Austrian channels: ${channel.name}`);
  
        let playurl = await extractPlayUrl(page, channel);
        if (playurl) {
          channel.playurl = playurl;
          console.log(`✅ Updated Austrian channel: ${channel.name} - ${playurl}`);
  
          const m3uContent = `#EXTINF:-1 tvg-id="${channel.id}" tvg-name="${channel.name}", ${channel.name}\n${playurl}\n`;
          await fs.appendFile(M3U_FILE_PATH, m3uContent, 'utf8');
        }
      }
    } catch (error) {
      console.error('❌ Error processing Austrian channels:', error);
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  async function extractPlayUrl(page, channel) {
  try {
    console.log(`🌐 Visiting: ${channel.url}`);
    let playurl = null;

    // Бриши претходни listeners за да нема дупликати
    page.removeAllListeners('request');

    // Фати прв .m3u8 линк
    page.on('request', request => {
      if (
        (request.resourceType() === 'xhr' || request.resourceType() === 'fetch') &&
        request.url().includes('.m3u8') &&
        !playurl
      ) {
        playurl = request.url();
      }
    });

    await page.goto(channel.url, { waitUntil: 'networkidle2' });

    // ✅ Бриши devtools блокери
    await page.evaluate(() => {
      const script = document.querySelector('script[disable-devtool-auto]');
      if (script) {
        script.remove();
        console.log('✅ Removed disable-devtool script.');
      }
    });

    // ⏳ Чекај за да дојде м3у8 линк
    await new Promise(resolve => setTimeout(resolve, 8000));
    return playurl;
  } catch (error) {
    console.error(`❌ Error extracting playurl for ${channel.name}:`, error);
    return null;
  }
}


export default processATChannels;
