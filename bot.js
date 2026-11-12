const axios = require('axios');
const cheerio = require('cheerio');

// Переменные окружения Railway
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;

// Подпись
const SIGNATURE = '\n\n💬 sᴋʏᴘᴜʟsᴇ ᴜᴀ - ʜᴏʙиʜи уᴋᴘᴀїʜи (@skypulseua_chat)';

// Защита от дублей
const sentLinks = new Set();

// Отправка одной новости
async function sendNewsItem(title, link) {
    if (sentLinks.has(link)) return;

    const text = title + SIGNATURE;

    try {
        await axios.post(
            'https://api.telegram.org/bot' + BOT_TOKEN + '/sendMessage',
            {
                chat_id: CHANNEL_ID,
                text: text
            },
            { timeout: 10000 }
        );
        sentLinks.add(link);
        console.log('OK:', title.substring(0, 50));
    } catch (err) {
        console.error('ERR:', err.response ? JSON.stringify(err.response.data) : err.message);
    }
}

// Получение новостей
async function getNews() {
    // Метод 1: RSS
    try {
        var res = await axios.get('https://forbes.ua/rss', { timeout: 10000 });
        var $ = cheerio.load(res.data, { xmlMode: true });
        var items = [];
        $('item').each(function(i, el) {
            var t = $(el).find('title').text().trim();
            var l = $(el).find('link').text().trim();
            if (t && l && !sentLinks.has(l)) {
                items.push({ title: t, link: l });
            }
        });
        if (items.length > 0) return items;
    } catch (e) {
        console.log('RSS fail');
    }

    // Метод 2: HTML
    try {
        var res2 = await axios.get('https://forbes.ua/news', {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 15000
        });
        var $2 = cheerio.load(res2.data);
        var items2 = [];
        $('article, .news-card').each(function(i, el) {
            var t = $2(el).find('h2, h3, .title').first().text().trim();
            var l = $2(el).find('a').first().attr('href');
            if (l && l.charAt(0) === '/') {
                l = 'https://forbes.ua' + l;
            }
            if (t && l && !sentLinks.has(l)) {
                items2.push({ title: t, link: l });
            }
        });
        return items2;
    } catch (e) {
        console.log('HTML fail');
        return [];
    }
}

// Запуск
console.log('START');
console.log('TOKEN:', BOT_TOKEN ? 'YES' : 'NO');
console.log('CHANNEL:', CHANNEL_ID ? 'YES' : 'NO');

getNews().then(function(news) {
    if (news && news.length > 0) {
        console.log('Found:', news.length);
        sendNewsItem(news[0].title, news[0].link);
    } else {
        console.log('No news');
    }
});

setInterval(function() {
    getNews().then(function(news) {
        if (news && news.length > 0) {
            sendNewsItem(news[0].title, news[0].link);
        }
    });
}, 15 * 60 * 1000);
