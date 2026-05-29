// bot.js - H87 Telegram Bot (Lengkap untuk Railway/Pterodactyl)
const { Telegraf } = require('telegraf');
const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

// ============ KONFIGURASI ============
// Ambil token dari environment variable (Railway) atau hardcode (Pterodactyl)
const BOT_TOKEN = process.env.BOT_TOKEN || '8844621257:AAH7cPP_YtktBQ3na7B2ZCzHrUPL5srl-DA';
const H87_USERNAME = 'midasbot';
const H87_PASSWORD = 'shxxop';
const H87_URL = 'https://h87invite.shop';
const HEADLESS_MODE = true;  // true = background, false = lihat browser
const NAVIGATION_TIMEOUT = 30000;
const SESSIONS_DIR = './sessions';
// =====================================

// Logger sederhana
const logger = {
  info: (msg) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`),
  error: (msg) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`),
  debug: (msg) => console.log(`[DEBUG] ${new Date().toISOString()} - ${msg}`)
};

// Cek token
if (!BOT_TOKEN || BOT_TOKEN === 'YOUR_BOT_TOKEN_HERE') {
  console.error('❌ BOT_TOKEN tidak ditemukan!');
  console.error('📌 Set environment variable BOT_TOKEN atau isi manual di kode');
  process.exit(1);
}

// Inisialisasi bot
const bot = new Telegraf(BOT_TOKEN);
const userSessions = new Map();

// Buat folder sessions
(async () => {
  try {
    await fs.access(SESSIONS_DIR);
  } catch {
    await fs.mkdir(SESSIONS_DIR);
    logger.info(`📁 Created sessions directory: ${SESSIONS_DIR}`);
  }
})();

// ============ FUNGSI COOKIES ============
async function saveCookies(userId, cookies) {
  await fs.writeFile(
    path.join(SESSIONS_DIR, `user_${userId}.json`),
    JSON.stringify({ cookies, timestamp: Date.now() })
  );
  logger.debug(`💾 Saved cookies for user ${userId}`);
}

async function loadCookies(userId) {
  try {
    const data = await fs.readFile(path.join(SESSIONS_DIR, `user_${userId}.json`), 'utf8');
    const session = JSON.parse(data);
    if (Date.now() - session.timestamp > 7 * 24 * 60 * 60 * 1000) {
      logger.debug(`⏰ Session expired for user ${userId}`);
      return null;
    }
    logger.debug(`📀 Loaded cookies for user ${userId}`);
    return session.cookies;
  } catch {
    logger.debug(`🆕 No existing session for user ${userId}`);
    return null;
  }
}

// ============ FUNGSI UTAMA PROSES INVITE ============
async function processInvite(userId, inviteLink) {
  let browser = null;
  
  try {
    logger.info(`🚀 Processing invite for user ${userId}`);
    logger.info(`🔗 Link: ${inviteLink.substring(0, 80)}...`);

    // Launch browser dengan konfigurasi optimal
    browser = await puppeteer.launch({
      headless: HEADLESS_MODE,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer'
      ]
    });
    
    const page = await browser.newPage();
    
    // Set user agent yang umum
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Set viewport
    await page.setViewport({ width: 1280, height: 720 });
    
    // Load saved cookies
    const savedCookies = await loadCookies(userId);
    if (savedCookies && savedCookies.length > 0) {
      await page.setCookie(...savedCookies);
      logger.info(`🍪 Loaded existing cookies for user ${userId}`);
    }
    
    // Step 1: Go to H87 website
    logger.info(`🌐 Navigating to ${H87_URL}...`);
    await page.goto(H87_URL, { 
      waitUntil: 'networkidle2',
      timeout: NAVIGATION_TIMEOUT 
    });
    logger.info(`✅ Navigated to ${H87_URL}`);
    
    // Check if login is needed
    const hasPasswordField = await page.$('input[type="password"]');
    const needsLogin = hasPasswordField !== null || !savedCookies;
    
    if (needsLogin) {
      logger.info('🔐 Login required...');
      
      // Cari dan isi username
      const usernameSelectors = [
        'input[name="username"]', 
        'input[name="email"]', 
        'input[type="text"]'
      ];
      let usernameFilled = false;
      
      for (const selector of usernameSelectors) {
        const element = await page.$(selector);
        if (element) {
          await element.click({ clickCount: 3 });
          await element.type(H87_USERNAME);
          logger.debug(`📝 Filled username with selector: ${selector}`);
          usernameFilled = true;
          break;
        }
      }
      
      if (!usernameFilled) {
        await page.screenshot({ path: `debug_login_${userId}.png` });
        throw new Error('❌ Username field not found');
      }
      
      // Cari dan isi password
      const passwordField = await page.$('input[type="password"]');
      if (passwordField) {
        await passwordField.click({ clickCount: 3 });
        await passwordField.type(H87_PASSWORD);
        logger.debug('🔑 Filled password');
      } else {
        throw new Error('❌ Password field not found');
      }
      
      // Cari dan klik tombol login
      let loginClicked = false;
      
      // Coba cari button dengan text tertentu
      const buttonTexts = ['Login', 'Sign in', 'Masuk', 'Log in'];
      for (const text of buttonTexts) {
        const button = await page.$x(`//button[contains(text(), "${text}")]`);
        if (button.length > 0) {
          await button[0].click();
          loginClicked = true;
          logger.debug(`🔘 Clicked login button with text: ${text}`);
          break;
        }
      }
      
      // Jika tidak ketemu, coba selector umum
      if (!loginClicked) {
        const submitBtn = await page.$('button[type="submit"], input[type="submit"]');
        if (submitBtn) {
          await submitBtn.click();
          loginClicked = true;
          logger.debug('🔘 Clicked login button with type="submit"');
        }
      }
      
      if (!loginClicked) {
        throw new Error('❌ Login button not found');
      }
      
      // Wait for navigation after login
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {
        logger.debug('⏳ No navigation after login, might already be logged in');
      });
      
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Save cookies after login
      const cookies = await page.cookies();
      await saveCookies(userId, cookies);
      logger.info('✅ Login successful, cookies saved');
    }
    
    // Step 2: Find and fill invite link input
    logger.info('🔍 Looking for invite link input field...');
    
    // Cari input field untuk link
    const linkInputSelectors = [
      'input[type="text"]', 
      'textarea',
      'input[placeholder*="link" i]',
      'input[placeholder*="invite" i]'
    ];
    
    let linkInput = null;
    for (const selector of linkInputSelectors) {
      const element = await page.$(selector);
      if (element) {
        linkInput = element;
        logger.debug(`✅ Found link input with selector: ${selector}`);
        break;
      }
    }
    
    if (!linkInput) {
      await page.screenshot({ path: `debug_input_${userId}.png` });
      throw new Error('❌ Link input field not found');
    }
    
    await linkInput.click({ clickCount: 3 });
    await linkInput.type(inviteLink);
    logger.info(`📝 Filled invite link: ${inviteLink.substring(0, 80)}...`);
    
    // Step 3: Submit the form
    logger.info('📤 Submitting invite link...');
    let submitClicked = false;
    const submitTexts = ['Submit', 'Send', 'Process', 'Kirim', 'Add', 'Save'];
    
    for (const text of submitTexts) {
      const button = await page.$x(`//button[contains(text(), "${text}")]`);
      if (button.length > 0) {
        await button[0].click();
        submitClicked = true;
        logger.debug(`🔘 Clicked submit button with text: ${text}`);
        break;
      }
    }
    
    if (!submitClicked) {
      const submitBtn = await page.$('button[type="submit"], input[type="submit"]');
      if (submitBtn) {
        await submitBtn.click();
        submitClicked = true;
        logger.debug('🔘 Clicked submit button with type="submit"');
      }
    }
    
    if (!submitClicked) {
      throw new Error('❌ Submit button not found');
    }
    
    await new Promise(resolve => setTimeout(resolve, 4000));
    
    // Step 4: Get result message
    const resultMessage = await page.evaluate(() => {
      const selectors = [
        '.success', '.alert-success', '.error', '.alert-error',
        '.message', '.notification', '[class*="success"]', '[class*="error"]'
      ];
      
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent?.trim()) {
          return el.textContent.trim();
        }
      }
      
      if (document.title?.toLowerCase().includes('success')) {
        return 'Success - ' + document.title;
      }
      
      return null;
    });
    
    const finalMessage = resultMessage || '✅ Invite processed (no explicit confirmation)';
    
    // Update cookies
    const updatedCookies = await page.cookies();
    await saveCookies(userId, updatedCookies);
    
    await browser.close();
    
    logger.info(`🎉 Successfully processed invite for user ${userId}`);
    
    return {
      success: true,
      message: finalMessage,
      timestamp: new Date().toISOString(),
      link: inviteLink
    };
    
  } catch (error) {
    logger.error(`💥 Error processing invite: ${error.message}`);
    if (browser) {
      try {
        await browser.close();
      } catch (e) {}
    }
    return {
      success: false,
      message: error.message,
      timestamp: new Date().toISOString(),
      link: inviteLink
    };
  }
}

// ============ TELEGRAM COMMANDS ============

// Start command
bot.start(async (ctx) => {
  await ctx.reply(
`🎮 *H87 Invite Bot Active*

Kirimkan link referral Midasbuy ke bot ini, maka bot akan:
1️⃣ Login ke H87 website
2️⃣ Submit link referral Anda
3️⃣ Melaporkan hasilnya

📌 *Command:*
/stats - Lihat statistik Anda
/reset - Reset session (login ulang)
/status - Cek status bot
/help - Bantuan

⚡ *Catatan:* Proses memakan waktu 10-30 detik.`,
    { parse_mode: 'Markdown' }
  );
});

// Help command
bot.help(async (ctx) => {
  await ctx.reply(
`📖 *Cara Penggunaan:*

1️⃣ Dapatkan link referral dari Midasbuy
2️⃣ Copy link tersebut
3️⃣ Kirim link ke bot ini
4️⃣ Tunggu bot memproses (10-30 detik)
5️⃣ Bot akan memberi tahu hasilnya

📊 *Command:*
/stats - Lihat riwayat link
/reset - Reset session (login ulang)
/status - Cek status bot
/help - Bantuan ini`,
    { parse_mode: 'Markdown' }
  );
});

// Stats command
bot.command('stats', async (ctx) => {
  const userId = ctx.from.id;
  const userData = userSessions.get(userId) || { processed: [], total: 0, successCount: 0 };
  
  if (userData.processed.length === 0) {
    await ctx.reply('📭 Belum ada link yang diproses.');
    return;
  }
  
  const recent = userData.processed.slice(-5).reverse();
  let statsMsg = `📊 *Statistik Anda*\n\n`;
  statsMsg += `Total diproses: ${userData.total}\n`;
  statsMsg += `✅ Berhasil: ${userData.successCount}\n`;
  statsMsg += `❌ Gagal: ${userData.total - userData.successCount}\n\n`;
  statsMsg += `*5 Link terakhir:*\n`;
  
  recent.forEach((item, i) => {
    const status = item.success ? '✅' : '❌';
    const date = new Date(item.timestamp).toLocaleTimeString('id-ID');
    const shortLink = item.link.length > 50 ? item.link.substring(0, 47) + '...' : item.link;
    statsMsg += `${i+1}. ${status} ${date}\n   ${shortLink}\n`;
  });
  
  await ctx.reply(statsMsg, { parse_mode: 'Markdown' });
});

// Reset command
bot.command('reset', async (ctx) => {
  const userId = ctx.from.id;
  
  try {
    await fs.unlink(path.join(SESSIONS_DIR, `user_${userId}.json`));
    await ctx.reply('🔄 Session telah direset. Lain kali akan login ulang.');
  } catch {
    await ctx.reply('✅ Tidak ada session yang perlu direset.');
  }
  
  userSessions.delete(userId);
});

// Status command
bot.command('status', async (ctx) => {
  await ctx.reply(
`🤖 *Bot Status*

📡 H87 URL: ${H87_URL}
👤 H87 User: ${H87_USERNAME}
🕶️ Headless mode: ${HEADLESS_MODE ? 'ON' : 'OFF'}
💾 Sessions dir: ${SESSIONS_DIR}
⏱️ Timeout: ${NAVIGATION_TIMEOUT/1000}s

📊 Total users aktif: ${userSessions.size}
🟢 Bot: Running
🌐 Engine: Puppeteer
🚀 Platform: ${process.env.RAILWAY ? 'Railway' : 'Self-hosted'}`,
    { parse_mode: 'Markdown' }
  );
});

// Handle text messages (invite links)
bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const messageText = ctx.message.text;
  
  // Skip commands
  if (messageText.startsWith('/')) return;
  
  // Extract URL
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const urls = messageText.match(urlRegex);
  
  if (!urls || urls.length === 0) {
    await ctx.reply('❌ Tidak menemukan link URL. Kirim link referral Midasbuy yang valid.');
    return;
  }
  
  const inviteLink = urls[0];
  
  // Validate Midasbuy link
  if (!inviteLink.includes('midasbuy.com')) {
    await ctx.reply('⚠️ Link bukan dari Midasbuy. Pastikan link referral Midasbuy yang benar.\n\nContoh: https://www.midasbuy.com/...');
    return;
  }
  
  // Notify user
  const processingMsg = await ctx.reply(
    `🔄 *Memproses link...*\n\n` +
    `📎 Link: ${inviteLink.substring(0, 60)}...\n` +
    `⏳ Mohon tunggu 10-30 detik.`,
    { parse_mode: 'Markdown' }
  );
  
  // Process the invite
  const result = await processInvite(userId, inviteLink);
  
  // Update user stats
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
  
  // Send result
  if (result.success) {
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      processingMsg.message_id,
      null,
      `✅ *BERHASIL!*\n\n` +
      `📎 Link: ${inviteLink.substring(0, 60)}...\n` +
      `📝 Status: ${result.message}\n` +
      `🕐 Waktu: ${new Date(result.timestamp).toLocaleString('id-ID')}\n\n` +
      `📊 Ketik /stats untuk lihat riwayat.`,
      { parse_mode: 'Markdown' }
    );
  } else {
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      processingMsg.message_id,
      null,
      `❌ *GAGAL!*\n\n` +
      `📎 Link: ${inviteLink.substring(0, 60)}...\n` +
      `⚠️ Error: ${result.message}\n` +
      `🕐 Waktu: ${new Date(result.timestamp).toLocaleString('id-ID')}\n\n` +
      `💡 Saran: \n` +
      `• Coba /reset lalu kirim ulang\n` +
      `• Pastikan akun H87 masih aktif\n` +
      `• Cek dashboard H87 manual di browser`,
      { parse_mode: 'Markdown' }
    );
  }
});

// Error handler
bot.catch((err, ctx) => {
  logger.error(`💥 Bot error: ${err.message}`);
  ctx.reply('⚠️ Terjadi kesalahan. Coba lagi nanti atau gunakan /reset.');
});

// Graceful shutdown
process.once('SIGINT', () => {
  logger.info('🛑 Shutting down...');
  bot.stop('SIGINT');
});
process.once('SIGTERM', () => {
  logger.info('🛑 Shutting down...');
  bot.stop('SIGTERM');
});

// Start bot
bot.launch()
  .then(() => {
    logger.info('🚀 Bot started successfully with Puppeteer!');
    console.log('\n========================================');
    console.log('🤖 H87 Telegram Bot is running...');
    console.log(`📝 Bot token: ${BOT_TOKEN.substring(0, 15)}...`);
    console.log(`🌐 H87 URL: ${H87_URL}`);
    console.log(`👤 H87 User: ${H87_USERNAME}`);
    console.log(`🕶️ Headless mode: ${HEADLESS_MODE}`);
    console.log(`🚀 Platform: ${process.env.RAILWAY ? 'Railway' : 'Self-hosted'}`);
    console.log('========================================\n');
  })
  .catch(err => {
    logger.error(`💥 Failed to start bot: ${err.message}`);
    console.error('Failed to start bot:', err);
    process.exit(1);
  });
