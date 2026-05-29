// bot.js - H87 Telegram Bot (Tanpa Markdown - Fix Error)
const { Telegraf } = require('telegraf');
const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

// ============ KONFIGURASI ============
const BOT_TOKEN = process.env.BOT_TOKEN || '8844621257:AAH7cPP_YtktBQ3na7B2ZCzHrUPL5srl-DA';
const H87_USERNAME = 'midasbot';
const H87_PASSWORD = 'shxxop';
const H87_URL = 'https://h87invite.shop';
const HEADLESS_MODE = true;
const NAVIGATION_TIMEOUT = 30000;
const SESSIONS_DIR = './sessions';
// =====================================

// Logger
const logger = {
  info: (msg) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`),
  error: (msg) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`),
  debug: (msg) => console.log(`[DEBUG] ${new Date().toISOString()} - ${msg}`)
};

if (!BOT_TOKEN || BOT_TOKEN === 'YOUR_BOT_TOKEN_HERE') {
  console.error('BOT_TOKEN not found!');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const userSessions = new Map();

// Buat folder sessions
(async () => {
  try {
    await fs.access(SESSIONS_DIR);
  } catch {
    await fs.mkdir(SESSIONS_DIR);
    logger.info(`Created sessions directory: ${SESSIONS_DIR}`);
  }
})();

// Save cookies
async function saveCookies(userId, cookies) {
  await fs.writeFile(
    path.join(SESSIONS_DIR, `user_${userId}.json`),
    JSON.stringify({ cookies, timestamp: Date.now() })
  );
}

// Load cookies
async function loadCookies(userId) {
  try {
    const data = await fs.readFile(path.join(SESSIONS_DIR, `user_${userId}.json`), 'utf8');
    const session = JSON.parse(data);
    if (Date.now() - session.timestamp > 7 * 24 * 60 * 60 * 1000) return null;
    return session.cookies;
  } catch {
    return null;
  }
}

// Proses invite
async function processInvite(userId, inviteLink) {
  let browser = null;
  
  try {
    logger.info(`Processing invite for user ${userId}`);
    logger.info(`Link: ${inviteLink.substring(0, 80)}...`);

    browser = await puppeteer.launch({
      headless: HEADLESS_MODE,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    const savedCookies = await loadCookies(userId);
    if (savedCookies && savedCookies.length > 0) {
      await page.setCookie(...savedCookies);
    }
    
    await page.goto(H87_URL, { waitUntil: 'networkidle2', timeout: NAVIGATION_TIMEOUT });
    
    const hasPasswordField = await page.$('input[type="password"]');
    const needsLogin = hasPasswordField !== null || !savedCookies;
    
    if (needsLogin) {
      logger.info('Login required...');
      
      const usernameField = await page.$('input[name="username"], input[name="email"], input[type="text"]');
      if (usernameField) {
        await usernameField.click({ clickCount: 3 });
        await usernameField.type(H87_USERNAME);
      }
      
      const passwordField = await page.$('input[type="password"]');
      if (passwordField) {
        await passwordField.click({ clickCount: 3 });
        await passwordField.type(H87_PASSWORD);
      }
      
      const loginBtn = await page.$('button[type="submit"], input[type="submit"]');
      if (loginBtn) {
        await loginBtn.click();
      } else {
        await page.evaluate(() => {
          const btn = document.querySelector('button');
          if (btn) btn.click();
        });
      }
      
      await page.waitForNavigation({ timeout: 10000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 3000));
      
      const cookies = await page.cookies();
      await saveCookies(userId, cookies);
      logger.info('Login successful');
    }
    
    const linkInput = await page.$('input[type="text"], textarea');
    if (!linkInput) {
      throw new Error('Link input field not found');
    }
    
    await linkInput.click({ clickCount: 3 });
    await linkInput.type(inviteLink);
    
    const submitBtn = await page.$('button[type="submit"], input[type="submit"]');
    if (submitBtn) {
      await submitBtn.click();
    } else {
      await page.evaluate(() => {
        const btn = document.querySelector('button');
        if (btn) btn.click();
      });
    }
    
    await new Promise(r => setTimeout(r, 4000));
    
    const resultMessage = await page.evaluate(() => {
      const sel = document.querySelector('.success, .error, .message, .alert-success, .alert-error');
      return sel ? sel.textContent.trim() : 'Invite processed';
    });
    
    const updatedCookies = await page.cookies();
    await saveCookies(userId, updatedCookies);
    
    await browser.close();
    
    return {
      success: true,
      message: resultMessage,
      timestamp: new Date().toISOString(),
      link: inviteLink
    };
    
  } catch (error) {
    logger.error(`Error: ${error.message}`);
    if (browser) await browser.close();
    return {
      success: false,
      message: error.message,
      timestamp: new Date().toISOString(),
      link: inviteLink
    };
  }
}

// ============ TELEGRAM COMMANDS (TANPA MARKDOWN) ============

// Start command
bot.start(async (ctx) => {
  await ctx.reply(
`H87 Invite Bot Active

Kirimkan link referral Midasbuy ke bot ini, maka bot akan:
1. Login ke H87 website
2. Submit link referral Anda
3. Melaporkan hasilnya

Command:
/stats - Lihat statistik Anda
/reset - Reset session (login ulang)
/status - Cek status bot
/help - Bantuan

Catatan: Proses memakan waktu 10-30 detik.`
  );
});

// Help command
bot.help(async (ctx) => {
  await ctx.reply(
`Cara Penggunaan:

1. Dapatkan link referral dari Midasbuy
2. Copy link tersebut
3. Kirim link ke bot ini
4. Tunggu bot memproses (10-30 detik)
5. Bot akan memberi tahu hasilnya

Command:
/stats - Lihat riwayat link
/reset - Reset session (login ulang)
/status - Cek status bot
/help - Bantuan ini`
  );
});

// Stats command
bot.command('stats', async (ctx) => {
  const userId = ctx.from.id;
  const userData = userSessions.get(userId) || { processed: [], total: 0, successCount: 0 };
  
  if (userData.processed.length === 0) {
    await ctx.reply('Belum ada link yang diproses.');
    return;
  }
  
  const recent = userData.processed.slice(-5).reverse();
  let statsMsg = `Statistik Anda\n\n`;
  statsMsg += `Total diproses: ${userData.total}\n`;
  statsMsg += `Berhasil: ${userData.successCount}\n`;
  statsMsg += `Gagal: ${userData.total - userData.successCount}\n\n`;
  statsMsg += `5 Link terakhir:\n`;
  
  recent.forEach((item, i) => {
    const status = item.success ? '[SUCCESS]' : '[FAILED]';
    const date = new Date(item.timestamp).toLocaleTimeString('id-ID');
    const shortLink = item.link.length > 50 ? item.link.substring(0, 47) + '...' : item.link;
    statsMsg += `${i+1}. ${status} ${date}\n   ${shortLink}\n`;
  });
  
  await ctx.reply(statsMsg);
});

// Reset command
bot.command('reset', async (ctx) => {
  const userId = ctx.from.id;
  
  try {
    await fs.unlink(path.join(SESSIONS_DIR, `user_${userId}.json`));
    await ctx.reply('Session telah direset. Lain kali akan login ulang.');
  } catch {
    await ctx.reply('Tidak ada session yang perlu direset.');
  }
  
  userSessions.delete(userId);
});

// Status command
bot.command('status', async (ctx) => {
  await ctx.reply(
`Bot Status

H87 URL: ${H87_URL}
H87 User: ${H87_USERNAME}
Headless mode: ${HEADLESS_MODE ? 'ON' : 'OFF'}
Sessions dir: ${SESSIONS_DIR}
Timeout: ${NAVIGATION_TIMEOUT/1000}s

Total users aktif: ${userSessions.size}
Bot: Running
Engine: Puppeteer`
  );
});

// Handle text messages
bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const messageText = ctx.message.text;
  
  if (messageText.startsWith('/')) return;
  
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const urls = messageText.match(urlRegex);
  
  if (!urls || urls.length === 0) {
    await ctx.reply('Tidak menemukan link URL. Kirim link referral Midasbuy yang valid.');
    return;
  }
  
  const inviteLink = urls[0];
  
  if (!inviteLink.includes('midasbuy.com')) {
    await ctx.reply('Link bukan dari Midasbuy. Pastikan link referral Midasbuy yang benar.');
    return;
  }
  
  const processingMsg = await ctx.reply(
`Memproses link...

Link: ${inviteLink.substring(0, 60)}...
Mohon tunggu 10-30 detik.`
  );
  
  const result = await processInvite(userId, inviteLink);
  
  const userData = userSessions.get(userId) || { processed: [], total: 0, successCount: 0 };
  userData.processed.push({
    link: inviteLink,
    success: result.success,
    timestamp: result.timestamp,
    message: result.message
  });
  userData.total++;
  if (result.success) userData.successCount++;
  userSessions.set(userId, userData);
  
  if (result.success) {
    await ctx.telegram.editMessageText(ctx.chat.id, processingMsg.message_id, null,
`BERHASIL!

Link: ${inviteLink.substring(0, 60)}...
Status: ${result.message}
Waktu: ${new Date(result.timestamp).toLocaleString('id-ID')}

Ketik /stats untuk lihat riwayat.`
    );
  } else {
    await ctx.telegram.editMessageText(ctx.chat.id, processingMsg.message_id, null,
`GAGAL!

Link: ${inviteLink.substring(0, 60)}...
Error: ${result.message}
Waktu: ${new Date(result.timestamp).toLocaleString('id-ID')}

Saran: Coba /reset lalu kirim ulang.`
    );
  }
});

// Error handler
bot.catch((err, ctx) => {
  logger.error(`Bot error: ${err.message}`);
  ctx.reply('Terjadi kesalahan. Coba lagi nanti atau gunakan /reset.');
});

// Start bot
bot.launch()
  .then(() => {
    logger.info('Bot started successfully with Puppeteer!');
    console.log('\n========================================');
    console.log('H87 Telegram Bot is running...');
    console.log(`H87 URL: ${H87_URL}`);
    console.log(`H87 User: ${H87_USERNAME}`);
    console.log(`Headless mode: ${HEADLESS_MODE}`);
    console.log('========================================\n');
  })
  .catch(err => {
    logger.error(`Failed to start bot: ${err.message}`);
    console.error('Failed to start bot:', err);
    process.exit(1);
  });

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
