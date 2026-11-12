
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

// Используем новое имя переменной
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;

const SIGNATURE = '\n\n💬 sᴋʏᴘᴜʟsᴇ ᴜᴀ - ʜᴏʙиʜи уᴋᴘᴀїʜи (@skypulseua_chat) ';
const sentLinks = new Set();

async function sendNewsItem(title, link) {
    if (sentLinks.has(link)) return false;

    // Только чистый текст + подпись
    const textToSend = title + SIGNATURE;
    
    console.log('📤 Отправляю:', JSON.stringify(textToSend));

    try {
        const response = await axios.post(
            `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
            {
                chat_id: CHANNEL_ID,
                text: textToSend
                // parse_mode НЕ указан = обычный текст
            },
            { timeout: 10000 }
        );

        sentLinks.add(link);
        console.log('✅ УСПЕХ');
        return true;
    } catch (err) {
        console.error('❌ ОШИБКА:', JSON.stringify(err.response?.data));
        return false;
    }
}

async function getNews() {
    // 1. Пробуем RSS
    try {
        const { data } = await axios.get('https://forbes.ua/rss', { timeout: 10000 });
        const $ = cheerio.load(data, { xmlMode: true });
        const items = [];
        
        $('item').each((i, el) => {
            const t = $(el).find('title').text().trim();
            const l = $(el).find('link').text().trim();
            if (t && l && !sentLinks.has(l)) items.push({ title: t, link: l });
        });
        
        if (items.length > 0) return items;
    } catch (e) { console.log('RSS недоступен'); }

    // 2. Если RSS не сработал — парсим HTML
    try {
        const { data } = await axios.get('https://forbes.ua/news', {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 15000
        });
        const $ = cheerio.load(data);
        const items = [];
        
        $('article, .news-card').each((i, el) => {
            const t = $(el).find('h2, h3, .title').first().text().trim();
            let l = $(el).find('a').first().attr('href');
            if (l && l.startsWith('/')) l = `https://forbes.ua${l}`;
            if (t && l && !sentLinks.has(l)) items.push({ title: t, link: l });
        });
        return items;
    } catch (e) { 
        console.error('Ошибка парсинга:', e.message); 
        return []; 
    }
}

async function checkNews() {
    console.log('🔍 DIAGNOSTIC: CHANNEL_ID =', CHANNEL_ID);
    console.log('🔍 DIAGNOSTIC: TOKEN_START =', BOT_TOKEN ? BOT_TOKEN.substring(0, 8) : 'EMPTY');

    if (!CHANNEL_ID || !BOT_TOKEN) {
        console.error('❌ НЕТ ПЕРЕМЕННЫХ! Проверь TELEGRAM_CHANNEL_ID и TELEGRAM_BOT_TOKEN');
        return;
    }

    const news = await getNews();
    if (!news || news.length === 0) {
        console.log('ℹ️ Новостей нет');
        return;
    }

    console.log(`🚀 Найдено ${news.length}. Беру первую...`);
    await sendNewsItem(news[0].title, news[0].link);
}

console.log('🚀 Forbes Bot запущен (CLEAN TEXT MODE)');
checkNews();
setInterval(checkNews, 15 * 60 * 1000);
