// bot.js - H87 Telegram Bot (Fixed)
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

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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
    await page.setViewport({ width: 1280, height: 800 });
    
    // Load saved cookies
    const savedCookies = await loadCookies(userId);
    if (savedCookies && savedCookies.length > 0) {
      await page.setCookie(...savedCookies);
      logger.info(`Loaded cookies for user ${userId}`);
    }
    
    // Buka H87
    await page.goto(H87_URL, { waitUntil: 'networkidle2', timeout: NAVIGATION_TIMEOUT });
    logger.info(`Page loaded`);
    
    // Cek apakah perlu login
    const hasPasswordField = await page.$('input[type="password"]') !== null;
    const currentUrl = page.url();
    const isLoginPage = currentUrl.includes('login') || currentUrl.includes('signin');
    
    if (hasPasswordField || isLoginPage || !savedCookies) {
      logger.info('Login required...');
      
      // Isi username
      const usernameSelectors = ['input[name="username"]', 'input[name="email"]', 'input[type="text"]'];
      let usernameFilled = false;
      for (const selector of usernameSelectors) {
        const element = await page.$(selector);
        if (element) {
          await element.click({ clickCount: 3 });
          await element.type(H87_USERNAME);
          logger.info(`Filled username with: ${selector}`);
          usernameFilled = true;
          break;
        }
      }
      
      if (!usernameFilled) {
        throw new Error('Username field not found');
      }
      
      // Isi password
      const passwordField = await page.$('input[type="password"]');
      if (passwordField) {
        await passwordField.click({ clickCount: 3 });
        await passwordField.type(H87_PASSWORD);
        logger.info('Filled password');
      } else {
        throw new Error('Password field not found');
      }
      
      // Cek checkbox "Remember login" - FIXED
      const rememberCheckbox = await page.$('input[type="checkbox"]');
      if (rememberCheckbox) {
        // Perbaikan: gunakan evaluate untuk cek checked
        const isChecked = await page.evaluate(el => el.checked, rememberCheckbox);
        if (!isChecked) {
          await rememberCheckbox.click();
          logger.info('Checked "Remember login"');
        }
      }
      
      // Klik tombol LOGIN
      let loginClicked = false;
      const loginSelectors = ['button[type="submit"]', 'input[type="submit"]', 'button'];
      
      for (const selector of loginSelectors) {
        const button = await page.$(selector);
        if (button) {
          await button.click();
          loginClicked = true;
          logger.info(`Clicked login with: ${selector}`);
          break;
        }
      }
      
      if (!loginClicked) {
        await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button, input[type="submit"]'));
          const loginBtn = buttons.find(btn => 
            btn.textContent?.toUpperCase().includes('LOGIN')
          );
          if (loginBtn) loginBtn.click();
        });
        logger.info('Clicked login via text search');
      }
      
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
      await delay(3000);
      
      const cookies = await page.cookies();
      await saveCookies(userId, cookies);
      logger.info('Login successful, cookies saved');
    }
    
    // Cari input link invite
    logger.info('Looking for invite link input...');
    await delay(2000);
    
    const linkInputSelectors = [
      'textarea',
      'input[type="text"]',
      'input[placeholder*="Paste"]',
      'textarea[placeholder*="Paste"]',
      'input[placeholder*="invite"]',
      '[class*="invite"] input',
      '[class*="link"] input'
    ];
    
    let linkInput = null;
    for (const selector of linkInputSelectors) {
      const element = await page.$(selector);
      if (element && await element.isVisible().catch(() => false)) {
        linkInput = element;
        logger.info(`Found link input with: ${selector}`);
        break;
      }
    }
    
    if (!linkInput) {
      linkInput = await page.evaluateHandle(() => {
        const inputs = document.querySelectorAll('input[type="text"], textarea');
        for (const input of inputs) {
          const placeholder = input.getAttribute('placeholder') || '';
          if (placeholder.toLowerCase().includes('paste') || 
              placeholder.toLowerCase().includes('invite')) {
            return input;
          }
        }
        return null;
      });
      
      if (!(await linkInput.asElement())) {
        await page.screenshot({ path: `debug_no_input_${userId}.png` });
        throw new Error('Invite link input not found');
      }
      logger.info('Found link input via placeholder text');
    }
    
    // Isi link
    await linkInput.click({ clickCount: 3 });
    await linkInput.type(inviteLink);
    logger.info(`Filled invite link`);
    await delay(1000);
    
    // Cari tombol RUN
    logger.info('Looking for RUN button...');
    
    const runButtonSelectors = [
      'button:has-text("RUN")',
      'button:has-text("Run")',
      'button[type="submit"]',
      'button',
      '.run-button',
      '[class*="run"] button'
    ];
    
    let runButton = null;
    for (const selector of runButtonSelectors) {
      const button = await page.$(selector);
      if (button && await button.isVisible().catch(() => false)) {
        runButton = button;
        logger.info(`Found RUN button with: ${selector}`);
        break;
      }
    }
    
    if (!runButton) {
      runButton = await page.evaluateHandle(() => {
        const buttons = Array.from(document.querySelectorAll('button, input[type="submit"]'));
        const runBtn = buttons.find(btn => 
          btn.textContent?.toUpperCase() === 'RUN' ||
          btn.textContent?.toUpperCase().includes('RUN')
        );
        return runBtn || null;
      });
      
      if (!(await runButton.asElement())) {
        await page.screenshot({ path: `debug_no_button_${userId}.png` });
        throw new Error('RUN button not found');
      }
      logger.info('Found RUN button via text content');
    }
    
    // Klik RUN
    await runButton.click();
    logger.info('Clicked RUN button');
    await delay(5000);
    
    // Ambil hasil
    const resultMessage = await page.evaluate(() => {
      const selectors = ['.success', '.error', '.message', '.alert-success', '.alert-error'];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent?.trim()) {
          return el.textContent.trim();
        }
      }
      return 'Invite submitted, check dashboard';
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

// ============ TELEGRAM COMMANDS ============

bot.start(async (ctx) => {
  await ctx.reply(
`H87 Invite Bot Active

Kirimkan link referral Midasbuy ke bot ini.

Command:
/stats - Lihat statistik
/reset - Reset session
/status - Cek status bot`
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
  let statsMsg = `Statistik Anda\n\nTotal: ${userData.total}\nBerhasil: ${userData.successCount}\nGagal: ${userData.total - userData.successCount}\n\n5 Link terakhir:\n`;
  
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

// Handle pesan
bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const messageText = ctx.message.text;
  
  if (messageText.startsWith('/')) return;
  
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const urls = messageText.match(urlRegex);
  
  if (!urls || !urls[0].includes('midasbuy.com')) {
    await ctx.reply('Kirim link referral Midasbuy yang valid.');
    return;
  }
  
  const inviteLink = urls[0];
  const processingMsg = await ctx.reply(`Memproses link... ${inviteLink.substring(0, 60)}...`);
  
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
Waktu: ${new Date(result.timestamp).toLocaleString('id-ID')}`
    );
  } else {
    await ctx.telegram.editMessageText(ctx.chat.id, processingMsg.message_id, null,
`GAGAL!

Link: ${inviteLink.substring(0, 60)}...
Error: ${result.message}
Waktu: ${new Date(result.timestamp).toLocaleString('id-ID')}

Coba /reset lalu kirim ulang.`
    );
  }
});

bot.catch((err, ctx) => {
  logger.error(`Bot error: ${err.message}`);
  ctx.reply('Terjadi kesalahan. Coba /reset');
});

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
