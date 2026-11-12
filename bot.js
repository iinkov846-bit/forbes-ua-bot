const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

// Переменные окружения
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const RSS_URL = 'https://forbes.ua/rss';
const SITE_URL = 'https://forbes.ua/news';

// Хранилище отправленных ссылок (для проверки дублей)
const sentLinks = new Set();
const SIGNATURE = '\n\n💬 sᴋʏᴘᴜʟsᴇ ᴜᴀ - ʜᴏʙиʜи уᴋᴘᴀїʜи (@skypulseua_chat) ';

// Функция отправки ТОЛЬКО заголовка
async function sendNewsItem(title, link) {
    // Проверка на дубликаты по ссылке
    if (sentLinks.has(link)) {
        console.log(`⏭️ Пропуск (уже было): ${title}`);
        return false;
    }

    try {
        // Отправляем ЧИСТЫЙ ТЕКСТ без HTML, ссылок и подписей
        const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
        await axios.post(url, {
            chat_id: CHAT_ID,
            text: title, // Только заголовок!
            parse_mode: undefined // Отключаем форматирование
        }, { timeout: 10000 });

        sentLinks.add(link);
        console.log(`✅ Отправлено: ${title}`);
        return true;
    } catch (err) {
        console.error('❌ Ошибка отправки:', err.response?.data || err.message);
        return false;
    }
}

// Парсинг RSS (приоритет)
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

// Парсинг HTML (резерв)
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

// Главная функция
async function checkNews() {
    console.log('🔍 DIAGNOSTIC: CHAT_ID =', CHAT_ID);
    
    if (!CHAT_ID || !BOT_TOKEN) {
        console.error('❌ КРИТИЧЕСКАЯ ОШИБКА: Нет переменных!');
        return;
    }

    let news = await parseRSS();
    if (news === null) news = await parseHTML();

    if (!news || news.length === 0) {
        console.log('ℹ️ Новых новостей нет');
        return;
    }

    console.log(`🚀 Найдено ${news.length}. Беру ПЕРВУЮ...`);
    const firstNews = news[0];
    const success = await sendNewsItem(firstNews.title, firstNews.link);
    
    if (!success) {
        console.log('⚠️ Не отправилось.');
    }
}

// Запуск
console.log('🚀 Forbes News Bot (Только заголовки)');
checkNews(); 

// Проверка каждые 15 минут
setInterval(checkNews, 15 * 60 * 1000); 
