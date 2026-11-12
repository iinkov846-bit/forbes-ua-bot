const axios = require('axios');
const cheerio = require('cheerio');
const { Telegraf } = require('telegraf');
require('dotenv').config();

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const CHAT_ID = process.env.CHAT_ID;
const RSS_URL = 'https://forbes.ua/rss';
const SITE_URL = 'https://forbes.ua/news';

let sentLinks = new Set();

// Функция отправки одной новости
async function sendNewsItem(title, link, image) {
    try {
        if (image) {
            await bot.telegram.sendPhoto(CHAT_ID, image, {
                caption: `<b>${title}</b>\n\n<a href="${link}">🔗 Читать на Forbes.ua</a>`,
                parse_mode: 'HTML'
            });
        } else {
            await bot.telegram.sendMessage(CHAT_ID, `<b>${title}</b>\n\n<a href="${link}">🔗 Читать на Forbes.ua</a>`, {
                parse_mode: 'HTML'
            });
        }
        // Пауза 2 секунды между сообщениями
        await new Promise(r => setTimeout(r, 2000));
        console.log(`✅ Отправлено: ${title.substring(0, 50)}...`);
    } catch (err) {
        console.error('❌ Ошибка отправки:', err.response?.data || err.message);
    }
}

// Метод 1: Парсинг RSS (самый надежный)
async function parseRSS() {
    try {
        console.log('📡 Пробую получить новости через RSS...');
        const { data } = await axios.get(RSS_URL, { timeout: 10000 });
        const $ = cheerio.load(data, { xmlMode: true });
        const items = [];

        $('item').each((i, elem) => {
            const title = $(elem).find('title').text().trim();
            const link = $(elem).find('link').text().trim();
            // Иногда картинка есть в enclosure или media:content
            let image = $(elem).find('enclosure').attr('url') || 
                        $(elem).find('media\\:content').attr('url') ||
                        $(elem).find('image').attr('href');

            if (title && link && !sentLinks.has(link)) {
                items.push({ title, link, image });
                sentLinks.add(link);
            }
        });
        
        if (items.length > 0) {
            console.log(`🎉 RSS работает! Найдено ${items.length} новостей`);
            return items.slice(0, 5);
        }
        return [];
    } catch (error) {
        console.log('⚠️ RSS не доступен, переключаюсь на парсинг сайта...');
        return null; // Возвращаем null, чтобы запустить метод 2
    }
}

// Метод 2: Парсинг HTML (fallback)
async function parseHTML() {
    try {
        console.log('🔍 Сканирую HTML страницы Forbes.ua...');
        const { data } = await axios.get(SITE_URL, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
            timeout: 15000
        });

        const $ = cheerio.load(data);
        const items = [];

        // Ищем статьи. Forbes использует разные классы, пробуем несколько вариантов
        $('article, .news-card, .post-item, .feed-item').each((i, elem) => {
            const title = $(elem).find('h2, h3, .title, .headline').first().text().trim();
            const link = $(elem).find('a').first().attr('href');
            let image = $(elem).find('img').first().attr('src') || 
                        $(elem).find('img').first().attr('data-src') ||
                        $(elem).find('img').first().attr('data-lazy-src');

            // Чиним ссылки
            if (link && link.startsWith('/')) link = `https://forbes.ua${link}`;
            if (image && image.startsWith('/')) image = `https://forbes.ua${image}`;
            // Убираем параметры размера картинки для чистого URL
            if (image) image = image.split('?')[0];

            if (title && link && !sentLinks.has(link)) {
                items.push({ title, link, image });
                sentLinks.add(link);
            }
        });

        console.log(`📰 HTML парсинг: найдено ${items.length} новостей`);
        return items.slice(0, 5);
    } catch (error) {
        console.error('❌ Ошибка парсинга HTML:', error.message);
        return [];
    }
}

// Главная функция проверки
async function checkNews() {
    // Сначала пробуем RSS
    let news = await parseRSS();
    
    // Если RSS не сработал (вернул null), пробуем HTML
    if (news === null) {
        news = await parseHTML();
    }

    if (!news || news.length === 0) {
        console.log('ℹ️ Новых новостей нет');
        return;
    }

    console.log(`🚀 Начинаю отправку ${news.length} новостей...`);
    for (const item of news) {
        await sendNewsItem(item.title, item.link, item.image);
    }
}

// Запуск
console.log('🚀 Forbes News Bot запущен');
checkNews(); // Проверяем сразу при старте

// Затем каждые 20 минут (1200000 мс)
// 20 минут - оптимально: не слишком часто для сайта, но достаточно оперативно
setInterval(checkNews, 20 * 60 * 1000); 
