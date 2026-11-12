const axios = require('axios');
const cheerio = require('cheerio');
const { Telegraf } = require('telegraf');
require('dotenv').config();

// Инициализация
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const CHAT_ID = process.env.CHAT_ID;
const RSS_URL = 'https://forbes.ua/rss';
const SITE_URL = 'https://forbes.ua/news';

// Хранилище отправленных ссылок
const sentLinks = new Set();

// Функция отправки ОДНОЙ новости
async function sendNewsItem(title, link) {
    // Проверка на дубликаты
    if (sentLinks.has(link)) {
        console.log(`⏭️ Пропуск (уже было): ${title.substring(0, 40)}...`);
        return false;
    }

    try {
        const text = `<b>📰 ${title}</b>\n\n<a href="${link}">🔗 Читать на Forbes.ua</a>`;
        
        await bot.telegram.sendMessage(CHAT_ID, text, {
            parse_mode: 'HTML',
            disable_web_page_preview: false 
        });

        sentLinks.add(link);
        console.log(`✅ Отправлено: ${title.substring(0, 50)}...`);
        return true;
    } catch (err) {
        console.error('❌ Ошибка отправки:', err.response?.data || err.message);
        return false;
    }
}

// Парсинг RSS
async function parseRSS() {
    try {
        const { data } = await axios.get(RSS_URL, { timeout: 10000 });
        const $ = cheerio.load(data, { xmlMode: true });
        const items = [];

        $('item').each((i, elem) => {
            const title = $(elem).find('title').text().trim();
            const link = $(elem).find('link').text().trim();
            if (title && link && !sentLinks.has(link)) {
                items.push({ title, link });
            }
        });
        return items.length > 0 ? items : null;
    } catch (error) {
        return null;
    }
}

// Парсинг HTML
async function parseHTML() {
    try {
        const { data } = await axios.get(SITE_URL, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' 
            },
            timeout: 15000
        });

        const $ = cheerio.load(data);
        const items = [];

        $('article, .news-card, .post-item, .feed-item').each((i, elem) => {
            const title = $(elem).find('h2, h3, .title, .headline').first().text().trim();
            let link = $(elem).find('a').first().attr('href');
            if (link && link.startsWith('/')) link = `https://forbes.ua${link}`;
            if (title && link && !sentLinks.has(link)) {
                items.push({ title, link });
            }
        });
        return items;
    } catch (error) {
        console.error('❌ Ошибка парсинга HTML:', error.message);
        return [];
    }
}

// Главная функция проверки
async function checkNews() {
    console.log('🔍 DIAGNOSTIC: CHAT_ID =', CHAT_ID);
    
    if (!CHAT_ID || CHAT_ID === 'undefined') {
        console.error('❌ КРИТИЧЕСКАЯ ОШИБКА: CHAT_ID пустой!');
        return;
    }

    let news = await parseRSS();
    if (news === null) news = await parseHTML();

    if (!news || news.length === 0) {
        console.log('ℹ️ Новых новостей нет');
        return;
    }

    console.log(`🚀 Найдено ${news.length} новостей. Беру только ПЕРВУЮ новую...`);
    
    // ⚡ ВАЖНО: Берем только первую новость из списка
    const firstNews = news[0];
    const success = await sendNewsItem(firstNews.title, firstNews.link);
    
    if (!success) {
        console.log('⚠️ Первая новость не отправилась. Остальные пропускаю.');
    }
}

// Запуск
console.log('🚀 Forbes News Bot запущен (Режим: 1 новость за цикл)');
checkNews(); 

// Проверка каждые 15 минут (чаще, так как берем по одной)
setInterval(checkNews, 15 * 60 * 1000); 
