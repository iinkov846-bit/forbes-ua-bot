var axios = require('axios');
var cheerio = require('cheerio');

var BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
var CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;
var SIGNATURE = '\n\n💬 SkyPulse UA | Чат / Новини України';
var sentLinks = {};

var HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'uk-UA,uk;q=0.9,en;q=0.8',
    'Accept-Encoding': 'identity',
    'Connection': 'keep-alive'
};

// Получаем og:image со страницы статьи
function getImageFromArticle(url) {
    return axios.get(url, { headers: HEADERS, timeout: 10000 }).then(function(res) {
        var $ = cheerio.load(res.data);
        var img = $('meta[property="og:image"]').attr('content');
        if (!img) img = $('meta[name="og:image"]').attr('content');
        if (!img) img = $('article img').first().attr('src');
        if (!img) img = $('img[src*="forbes"]').first().attr('src');
        console.log('IMG:', img ? img.substring(0, 80) : 'NONE');
        return img || null;
    }).catch(function() {
        return null;
    });
}

// Отправка с фото или без
function sendNewsItem(title, link, imageUrl) {
    if (sentLinks[link]) return;

    var caption = title + SIGNATURE;

    if (imageUrl) {
        // Отправляем ФОТО с подписью
        axios.post(
            'https://api.telegram.org/bot' + BOT_TOKEN + '/sendPhoto',
            {
                chat_id: CHANNEL_ID,
                photo: imageUrl,
                caption: caption
            },
            { timeout: 15000 }
        ).then(function() {
            sentLinks[link] = true;
            console.log('OK+IMG:', title.substring(0, 50));
        }).catch(function(err) {
            console.log('Photo fail, sending text...');
            // Если фото не отправилось — шлём текст
            sendTextOnly(title, link);
        });
    } else {
        // Нет фото — шлём текст
        sendTextOnly(title, link);
    }
}

function sendTextOnly(title, link) {
    var text = title + SIGNATURE;
    axios.post(
        'https://api.telegram.org/bot' + BOT_TOKEN + '/sendMessage',
        { chat_id: CHANNEL_ID, text: text },
        { timeout: 10000 }
    ).then(function() {
        sentLinks[link] = true;
        console.log('OK:', title.substring(0, 50));
    }).catch(function(err) {
        console.error('ERR:', err.response ? JSON.stringify(err.response.data) : err.message);
    });
}

// Парсинг списка новостей
function getNewsList() {
    return axios.get('https://forbes.ua/news', {
        headers: HEADERS,
        timeout: 15000
    }).then(function(res) {
        console.log('HTML status:', res.status);
        var $ = cheerio.load(res.data);
        var items = [];

        // Ищем все ссылки на статьи
        $('a[href*="/news/"]').each(function(i, el) {
            var href = $(el).attr('href');
            var t = $(el).text().trim();

            // Фильтруем: только реальные статьи (длинный заголовок)
            if (t && t.length > 15 && href && href.indexOf('/news/') > -1) {
                var fullLink = href;
                if (fullLink.charAt(0) === '/') fullLink = 'https://forbes.ua' + fullLink;

                // Убираем дубликаты
                var exists = false;
                for (var j = 0; j < items.length; j++) {
                    if (items[j].link === fullLink) exists = true;
                }

                if (!exists && !sentLinks[fullLink]) {
                    items.push({ title: t, link: fullLink });
                }
            }
        });

        console.log('Found links:', items.length);
        return items;
    }).catch(function(e) {
        console.log('HTML fail:', e.message);
        return [];
    });
}

// Главная функция
function checkNews() {
    console.log('--- CHECK ---');
    console.log('TOKEN:', BOT_TOKEN ? 'YES' : 'NO');
    console.log('CHANNEL:', CHANNEL_ID ? 'YES' : 'NO');

    getNewsList().then(function(news) {
        if (!news || news.length === 0) {
            console.log('No news');
            return;
        }

        console.log('Taking first:', news[0].title.substring(0, 50));

        // Шаг 1: Получаем картинку со страницы статьи
        getImageFromArticle(news[0].link).then(function(imageUrl) {
            // Шаг 2: Отправляем с картинкой или без
            sendNewsItem(news[0].title, news[0].link, imageUrl);
        });
    });
}

console.log('START Forbes Bot v2 (with images)');
checkNews();

setInterval(function() {
    checkNews();
}, 15 * 60 * 1000);
