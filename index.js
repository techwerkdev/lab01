import express from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { simpleGit } from 'simple-git';
import processBGChannels from './scrapers/bgchannels.js';
import processROChannels from './scrapers/channelsro.js';
import processMKChannels from './scrapers/mkchannels.js';
import processATChannels from './scrapers/atchannels.js';

const app = express();
const port = 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Конфигурирање на Git
const git = simpleGit();

// Фајлови по држава
const CHANNEL_FILES = {
  bg: path.resolve(__dirname, './output m3u/network_requestsBG.m3u'),
  ro: path.resolve(__dirname, './output m3u/network_requestsRO.m3u'),
  mk: path.resolve(__dirname, './output m3u/network_requestsMK.m3u'),
  at: path.resolve(__dirname, './output m3u/network_requestsAT.m3u'),
  my: path.resolve(__dirname, './output m3u/tihimor_nikolovski_2477112.m3u'),
};

// Функција за конвертирање на канали во формат .m3u
function channelsToM3U(channels) {
  let content = '#EXTM3U\n';
  for (const ch of channels) {
    content += `#EXTINF:-1 tvg-id="${ch.id}" tvg-name="${ch.name}",${ch.name}\n${ch.playurl}\n`;
  }
  return content;
}

// Функција за извлекување канали и пишување во фајл
async function extractChannelsToFile(channelData, filePath) {
  try {
    if (!channelData || channelData.length === 0) {
      console.error(`❌ No data to write to file: ${filePath}`);
      return;
    }
    const m3uContent = channelsToM3U(channelData);
    await fs.writeFile(filePath, m3uContent, 'utf-8');
    console.log(`✅ Channels written to ${filePath}`);
  } catch (error) {
    console.error(`❌ Error writing channels to ${filePath}:`, error);
  }
}

// Функција за автоматски git commit и push
async function gitCommitAndPush() {
  try {
    console.log('🚀 Adding and committing changes to Git...');
    
    // Додавање на сите промени
    await git.add('.');

    // Комитување на промените
    await git.commit('Automated channel files update');

    // Пуштање на промените
    await git.push('origin', 'main'); // Може да се прилагоди на вашиот основен бранч

    console.log('✅ Git push successful!');
  } catch (error) {
    console.error('❌ Error with Git operations:', error);
  }
}

// API Endpoint за динамичко процесирање на канали по земја
app.get('/api/channels/:country', async (req, res) => {
  const { country } = req.params;

  console.log(`🚀 Processing channels for ${country.toUpperCase()}...`);

  const filePath = CHANNEL_FILES[country.toLowerCase()];
  if (!filePath) {
    res.status(400).json({ error: `No channels file for ${country}` });
    return;
  }

  // Преку параметар за земја избираме која функција ќе се изврши
  let channels;
  try {
    switch (country.toLowerCase()) {
      case 'bg':
        channels = await processBGChannels();
        break;
      case 'ro':
        channels = await processROChannels();
        break;
      case 'mk':
        channels = await processMKChannels();
        break;
      case 'at':
        channels = await processATChannels();
        break;
      default:
        res.status(400).json({ error: 'Invalid country specified' });
        return;
    }

    // Запишување на каналите во фајл
    await extractChannelsToFile(channels, filePath);

    // Повик за автоматско додавње и пуштање во Git
    await gitCommitAndPush();

    res.status(200).json({
      message: `${country.toUpperCase()} channels processed and changes pushed to Git!`,
      file: filePath,
    });

  } catch (error) {
    console.error('❌ Error processing channels:', error);
    res.status(500).json({ error: 'Failed to process channels' });
  }
});

// Почетен старт на серверот
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
