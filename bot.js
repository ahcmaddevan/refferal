// bot.js - H87 Telegram Bot (Selector Sudah Disesuaikan untuk Dashboard H87)
const { Telegraf } = require('telegraf');
const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

// ============ KONFIGURASI ============
const BOT_TOKEN = process.env.BOT_TOKEN || '7881014057:AAHfcZNy3pKEcwsr-PLEVNkFkrz9X3ZAzXo';
const H87_USERNAME = 'midasbot';
const H87_PASSWORD = 'shxxop';
const H87_URL = 'https://h87invite.shop';
const HEADLESS_MODE = true;  // Ubah ke false jika ingin lihat prosesnya
const NAVIGATION_TIMEOUT = 30000;
const SESSIONS_DIR = './sessions';
// =====================================

const logger = {
  info: (msg) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`),
  error: (msg) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`),
  debug: (msg) => console.log(`[DEBUG] ${new Date().toISOString()} - ${msg}`)
};

if (!BOT_TOKEN) {
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

// Fungsi delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Proses invite dengan selector yang lebih presisi
async function processInvite(userId, inviteLink) {
  let browser = null;
  
  try {
    logger.info(`🚀 Processing invite for user ${userId}`);
    logger.info(`🔗 Link: ${inviteLink.substring(0, 80)}...`);

    // Launch browser
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
    await page.setViewport({ width: 1280, height: 800 });
    
    // Load saved cookies
    const savedCookies = await loadCookies(userId);
    if (savedCookies && savedCookies.length > 0) {
      await page.setCookie(...savedCookies);
      logger.info(`🍪 Loaded cookies for user ${userId}`);
    }
    
    // Buka H87
    logger.info(`🌐 Navigating to ${H87_URL}...`);
    await page.goto(H87_URL, { waitUntil: 'networkidle2', timeout: NAVIGATION_TIMEOUT });
    logger.info(`✅ Page loaded`);
    
    // Screenshot untuk debug
    await page.screenshot({ path: `debug_1_after_load_${userId}.png` });
    
    // Cek apakah perlu login
    const currentUrl = page.url();
    logger.info(`📍 Current URL: ${currentUrl}`);
    
    // Cek apakah di halaman login
    const hasLoginForm = await page.$('input[type="password"]') !== null;
    const isLoginPage = currentUrl.includes('login') || currentUrl.includes('signin');
    
    if (hasLoginForm || isLoginPage || !savedCookies) {
      logger.info('🔐 Login required...');
      
      // Isi username - coba berbagai selector
      const usernameSelectors = [
        'input[name="username"]',
        'input[name="email"]', 
        'input[type="text"]',
        '#username',
        '#email'
      ];
      
      let usernameFilled = false;
      for (const selector of usernameSelectors) {
        const element = await page.$(selector);
        if (element) {
          await element.click({ clickCount: 3 });
          await element.type(H87_USERNAME);
          logger.info(`📝 Filled username with: ${selector}`);
          usernameFilled = true;
          break;
        }
      }
      
      if (!usernameFilled) {
        await page.screenshot({ path: `debug_login_failed_${userId}.png` });
        throw new Error('Username field not found');
      }
      
      // Isi password
      const passwordSelectors = [
        'input[type="password"]',
        '#password'
      ];
      
      let passwordFilled = false;
      for (const selector of passwordSelectors) {
        const element = await page.$(selector);
        if (element) {
          await element.click({ clickCount: 3 });
          await element.type(H87_PASSWORD);
          logger.info(`🔑 Filled password with: ${selector}`);
          passwordFilled = true;
          break;
        }
      }
      
      if (!passwordFilled) {
        throw new Error('Password field not found');
      }
      
      // Cek apakah ada checkbox "Remember login"
      const rememberCheckbox = await page.$('input[type="checkbox"]');
      if (rememberCheckbox) {
        const isChecked = await rememberCheckbox.isChecked();
        if (!isChecked) {
          await rememberCheckbox.click();
          logger.info('✅ Checked "Remember login"');
        }
      }
      
      // Klik tombol LOGIN
      const loginSelectors = [
        'button[type="submit"]',
        'input[type="submit"]',
        'button:has-text("LOGIN")',
        'button:has-text("Login")',
        'button:has-text("Sign in")',
        'button'
      ];
      
      let loginClicked = false;
      for (const selector of loginSelectors) {
        try {
          const button = await page.$(selector);
          if (button) {
            await button.click();
            loginClicked = true;
            logger.info(`🔘 Clicked login with: ${selector}`);
            break;
          }
        } catch (e) {}
      }
      
      // Alternative: cari button berdasarkan text content
      if (!loginClicked) {
        await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button, input[type="submit"]'));
          const loginBtn = buttons.find(btn => 
            btn.textContent?.toUpperCase().includes('LOGIN') ||
            btn.textContent?.toUpperCase().includes('SIGN IN')
          );
          if (loginBtn) loginBtn.click();
        });
        loginClicked = true;
        logger.info('🔘 Clicked login via text search');
      }
      
      if (!loginClicked) {
        throw new Error('Login button not found');
      }
      
      // Tunggu navigasi setelah login
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {
        logger.debug('⏳ No navigation detected after login');
      });
      
      await delay(3000);
      
      // Simpan cookies
      const cookies = await page.cookies();
      await saveCookies(userId, cookies);
      logger.info('✅ Login successful, cookies saved');
      
      await page.screenshot({ path: `debug_2_after_login_${userId}.png` });
    }
    
    // ============ TAHAP SUBMIT INVITE LINK ============
    logger.info('🔍 Looking for invite link input field...');
    
    // Tunggu sebentar agar dashboard fully loaded
    await delay(2000);
    
    // Cari input field untuk link invite
    // Berdasarkan deskripsi: "Paste invite link here…"
    const linkInputSelectors = [
      'textarea',                                           // Textarea umum
      'input[type="text"]',                                 // Input text biasa
      'input[placeholder*="Paste"]',                        // Placeholder "Paste..."
      'input[placeholder*="paste"]',                        // Case insensitive
      'input[placeholder*="invite"]',                       // Placeholder mengandung "invite"
      'textarea[placeholder*="Paste"]',                     // Textarea dengan placeholder Paste
      'textarea[placeholder*="invite"]',                    // Textarea dengan placeholder invite
      '[class*="invite"] input',                            // Input di dalam class yang mengandung "invite"
      '[class*="link"] input',                              // Input di dalam class yang mengandung "link"
      '.invite-link-input',                                 // Class spesifik
      '#inviteLink',                                        // ID spesifik
      'input[name="link"]',                                 // Name attribute
      'input[name="invite"]',                               // Name attribute
      'textarea[name="link"]'                               // Textarea dengan name link
    ];
    
    let linkInput = null;
    let usedSelector = null;
    
    for (const selector of linkInputSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          const isVisible = await element.isVisible().catch(() => false);
          if (isVisible) {
            linkInput = element;
            usedSelector = selector;
            logger.info(`✅ Found link input with selector: ${selector}`);
            break;
          }
        }
      } catch (e) {}
    }
    
    // Jika tidak ketemu, coba cari semua input/textarea lalu cek placeholder
    if (!linkInput) {
      logger.info('🔍 Trying to find input by placeholder text...');
      linkInput = await page.evaluateHandle(() => {
        const inputs = document.querySelectorAll('input[type="text"], textarea');
        for (const input of inputs) {
          const placeholder = input.getAttribute('placeholder') || '';
          if (placeholder.toLowerCase().includes('paste') || 
              placeholder.toLowerCase().includes('invite') ||
              placeholder.toLowerCase().includes('link')) {
            return input;
          }
        }
        return null;
      });
      
      const isValid = await linkInput.asElement() !== null;
      if (isValid) {
        usedSelector = 'placeholder-based detection';
        logger.info('✅ Found link input via placeholder text');
      } else {
        linkInput = null;
      }
    }
    
    if (!linkInput) {
      await page.screenshot({ path: `debug_error_no_input_${userId}.png` });
      throw new Error('❌ Invite link input field not found');
    }
    
    // Isi link invite
    await linkInput.click({ clickCount: 3 });
    await linkInput.type(inviteLink);
    logger.info(`📝 Filled invite link: ${inviteLink.substring(0, 60)}...`);
    
    await delay(1000);
    
    // ============ TAHAP KLIK TOMBOL RUN ============
    logger.info('🔍 Looking for RUN button...');
    
    // Cari tombol RUN
    const runButtonSelectors = [
      'button:has-text("RUN")',                            // Button dengan text RUN
      'button:has-text("Run")',                            // Button dengan text Run
      'button[type="submit"]',                             // Submit button
      'input[type="submit"]',                              // Submit input
      'button',                                            // Button umum
      '.run-button',                                       // Class run-button
      '#runButton',                                        // ID runButton
      'button[class*="run"]',                              // Class mengandung "run"
      'button[class*="submit"]',                           // Class mengandung "submit"
      'div[class*="action"] button',                       // Button dalam action div
      '.Actions button'                                    // Button dalam Actions class
    ];
    
    let runButton = null;
    let usedButtonSelector = null;
    
    for (const selector of runButtonSelectors) {
      try {
        const button = await page.$(selector);
        if (button) {
          const isVisible = await button.isVisible().catch(() => false);
          if (isVisible) {
            runButton = button;
            usedButtonSelector = selector;
            logger.info(`✅ Found RUN button with selector: ${selector}`);
            break;
          }
        }
      } catch (e) {}
    }
    
    // Jika tidak ketemu, coba cari button dengan text RUN
    if (!runButton) {
      logger.info('🔍 Trying to find RUN button by text content...');
      runButton = await page.evaluateHandle(() => {
        const buttons = Array.from(document.querySelectorAll('button, input[type="submit"]'));
        const runBtn = buttons.find(btn => 
          btn.textContent?.toUpperCase() === 'RUN' ||
          btn.textContent?.toUpperCase() === 'RUN INVITE'
        );
        return runBtn || null;
      });
      
      const isValid = await runButton.asElement() !== null;
      if (isValid) {
        usedButtonSelector = 'text-content based detection';
        logger.info('✅ Found RUN button via text content');
      } else {
        runButton = null;
      }
    }
    
    if (!runButton) {
      await page.screenshot({ path: `debug_error_no_button_${userId}.png` });
      throw new Error('❌ RUN button not found');
    }
    
    // Klik tombol RUN
    await runButton.click();
    logger.info('🔘 Clicked RUN button');
    
    // Tunggu proses invite (H87 perlu waktu)
    await delay(5000);
    
    // Screenshot setelah klik
    await page.screenshot({ path: `debug_3_after_run_${userId}.png` });
    
    // ============ TAHAP AMBIL HASIL ============
    logger.info('🔍 Getting result message...');
    
    // Cari pesan hasil (success/failed)
    const resultMessage = await page.evaluate(() => {
      const selectors = [
        '.success',
        '.alert-success', 
        '.error',
        '.alert-error',
        '.message',
        '.notification',
        '[class*="success"]',
        '[class*="error"]',
        '[class*="alert"]',
        '.toast',
        '.toast-message'
      ];
      
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent?.trim()) {
          const text = el.textContent.trim();
          if (text.toLowerCase().includes('success') || 
              text.toLowerCase().includes('berhasil') ||
              text.toLowerCase().includes('failed') ||
              text.toLowerCase().includes('gagal')) {
            return text;
          }
        }
      }
      
      // Cek halaman order history
      const orderTable = document.querySelector('table, .order-history, [class*="order"]');
      if (orderTable && orderTable.textContent) {
        const lastRow = orderTable.textContent.split('\n').slice(-5).join(' ');
        if (lastRow.includes('success') || lastRow.includes('failed')) {
          return lastRow.substring(0, 200);
        }
      }
      
      return null;
    });
    
    const finalMessage = resultMessage || 'Invite submitted, check H87 dashboard for result';
    
    // Update cookies
    const updatedCookies = await page.cookies();
    await saveCookies(userId, updatedCookies);
    
    await browser.close();
    
    logger.info(`🎉 Process completed: ${finalMessage}`);
    
    return {
      success: true,
      message: finalMessage,
      timestamp: new Date().toISOString(),
      link: inviteLink
    };
    
  } catch (error) {
    logger.error(`💥 Error: ${error.message}`);
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

bot.start(async (ctx) => {
  await ctx.reply(
`H87 Invite Bot Active

Kirimkan link referral Midasbuy ke bot ini.

Command:
/stats - Lihat statistik
/reset - Reset session
/status - Cek status bot

Proses memakan waktu 15-30 detik.`
  );
});

bot.command('stats', async (ctx) => {
  const userId = ctx.from.id;
  const userData = userSessions.get(userId) || { processed: [], total: 0, successCount: 0 };
  
  if (userData.processed.length === 0) {
    await ctx.reply('Belum ada link yang diproses.');
    return;
  }
  
  const recent = userData.processed.slice(-5).reverse();
  let statsMsg = `Statistik Anda\n\n`;
  statsMsg += `Total: ${userData.total}\n`;
  statsMsg += `Berhasil: ${userData.successCount}\n`;
  statsMsg += `Gagal: ${userData.total - userData.successCount}\n\n`;
  statsMsg += `5 Link terakhir:\n`;
  
  recent.forEach((item, i) => {
    const status = item.success ? '[OK]' : '[FAIL]';
    const date = new Date(item.timestamp).toLocaleTimeString('id-ID');
    const shortLink = item.link.length > 50 ? item.link.substring(0, 47) + '...' : item.link;
    statsMsg += `${i+1}. ${status} ${date}\n   ${shortLink}\n`;
  });
  
  await ctx.reply(statsMsg);
});

bot.command('reset', async (ctx) => {
  const userId = ctx.from.id;
  try {
    await fs.unlink(path.join(SESSIONS_DIR, `user_${userId}.json`));
    await ctx.reply('Session telah direset.');
  } catch {
    await ctx.reply('Tidak ada session yang perlu direset.');
  }
  userSessions.delete(userId);
});

bot.command('status', async (ctx) => {
  await ctx.reply(
`Bot Status

H87 URL: ${H87_URL}
Headless: ${HEADLESS_MODE ? 'ON' : 'OFF'}
Users aktif: ${userSessions.size}
Bot: Running`
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
Mohon tunggu 15-30 detik.`
  );
  
  const result = await processInvite(userId, inviteLink);
  
  const userData = userSessions.get(userId) || { processed: [], total: 0, successCount: 0 };
  userData.processed.push(result);
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

bot.catch((err, ctx) => {
  logger.error(`Bot error: ${err.message}`);
  ctx.reply('Terjadi kesalahan. Coba /reset');
});

// Start bot
bot.launch()
  .then(() => {
    logger.info('Bot started successfully!');
    console.log('\n========================================');
    console.log('H87 Telegram Bot is running...');
    console.log('========================================\n');
  })
  .catch(err => {
    logger.error(`Failed to start bot: ${err.message}`);
    process.exit(1);
  });

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
