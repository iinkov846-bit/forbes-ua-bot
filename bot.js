const axios = require('axios');
const cheerio = require('cheerio');
const { Telegraf } = require('telegraf');
require('dotenv').config();

// Инициализация бота и переменных
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const CHAT_ID = process.env.CHAT_ID;
const RSS_URL = 'https://forbes.ua/rss';
const SITE_URL = 'https://forbes.ua/news';

// Хранилище отправленных ссылок (работает пока бот запущен)
const sentLinks = new Set();

// Функция отправки новости (Текст + Автопревью ссылки)
async function sendNewsItem(title, link) {
    try {
        // Проверка на дубликаты
        if (sentLinks.has(link)) {
            console.log(`⏭️ Пропуск (уже было): ${title.substring(0, 40)}...`);
            return;
        }

        const text = `<b>📰 ${title}</b>\n\n<a href="${link}">🔗 Читать на Forbes.ua</a>`;
        
        await bot.telegram.sendMessage(CHAT_ID, text, {
            parse_mode: 'HTML',
            disable_web_page_preview: false // Включаем генерацию превью Telegram
        });

        // Запоминаем ссылку, чтобы не отправить снова
        sentLinks.add(link);
        console.log(`✅ Отправлено: ${title.substring(0, 50)}...`);
        
        // Пауза 2 секунды между сообщениями (защита от спама)
        await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
        console.error('❌ Ошибка отправки:', err.response?.data || err.message);
    }
}

// Метод 1: Парсинг RSS (приоритетный)
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
        return null; // Возвращаем null, если RSS недоступен
    }
}

// Метод 2: Парсинг HTML (резервный)
async function parseHTML() {
    try {
        const { data } = await axios.get(SITE_URL, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
            },
            timeout: 15000
        });

        const $ = cheerio.load(data);
        const items = [];

        // Универсальные селекторы для новостей Forbes
        $('article, .news-card, .post-item, .feed-item').each((i, elem) => {
            const title = $(elem).find('h2, h3, .title, .headline').first().text().trim();
            let link = $(elem).find('a').first().attr('href');

            // Исправление относительных ссылок
            if (link && link.startsWith('/')) {
                link = `https://forbes.ua${link}`;
            }

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
        console.error('❌ КРИТИЧЕСКАЯ ОШИБКА: CHAT_ID пустой или undefined!');
        return;
    }

    // Пробуем RSS, если не вышло — HTML
    let news = await parseRSS();
    if (news === null) {
        news = await parseHTML();
    }

    if (!news || news.length === 0) {
        console.log('ℹ️ Новых новостей нет');
        return;
    }

    console.log(`🚀 Найдено ${news.length} новостей. Начинаю фильтрацию...`);
    for (const item of news) {
        await sendNewsItem(item.title, item.link);
    }
}

// Запуск бота
console.log('🚀 Forbes News Bot запущен');
checkNews(); // Первая проверка сразу при старте

// Далее проверяем каждые 20 минут
setInterval(checkNews, 20 * 60 * 1000); 
