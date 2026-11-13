var axios = require('axios');
var cheerio = require('cheerio');
var fs = require('fs');

var BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
var CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;
var SIGNATURE = '\n\n💬 sᴋʏᴘᴜʟsᴇ ᴜᴀ - ʜᴏʙиʜи уᴋᴘᴀїʜи (@skypulseua_chat)';
var DATA_FILE = '/data/sent.json';

var sentLinks = {};
var isFirstRun = true;

var HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'uk-UA,uk;q=0.9,en;q=0.8',
    'Accept-Encoding': 'identity',
    'Connection': 'keep-alive'
};

// Загрузка памяти из файла (если подключен Volume)
function loadSent() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            sentLinks = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            console.log('LOADED:', Object.keys(sentLinks).length, 'sent links from disk');
        } else {
            console.log('No data file on disk');
        }
    } catch (e) {
        console.log('Load fail:', e.message);
    }
}

// Сохранение памяти в файл
function saveSent() {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(sentLinks));
    } catch (e) {
        // Нет Volume — работаем просто в памяти
    }
}

// Получаем картинку со страницы статьи
function getImageFromArticle(url) {
    return axios.get(url, { headers: HEADERS, timeout: 10000 }).then(function(res) {
        var $ = cheerio.load(res.data);
        var img = $('meta[property="og:image"]').attr('content');
        if (!img) img = $('article img').first().attr('src');
        return img || null;
    }).catch(function() {
        return null;
    });
}

// Отправка текста
function sendTextOnly(title, link) {
    axios.post(
        'https://api.telegram.org/bot' + BOT_TOKEN + '/sendMessage',
        { chat_id: CHANNEL_ID, text: title + SIGNATURE },
        { timeout: 10000 }
    ).then(function() {
        sentLinks[link] = true;
        saveSent();
        console.log('OK:', title.substring(0, 50));
    }).catch(function(err) {
        console.error('ERR:', err.response ? JSON.stringify(err.response.data) : err.message);
    });
}

// Отправка с фото или без
function sendNewsItem(title, link, imageUrl) {
    if (imageUrl) {
        axios.post(
            'https://api.telegram.org/bot' + BOT_TOKEN + '/sendPhoto',
            { chat_id: CHANNEL_ID, photo: imageUrl, caption: title + SIGNATURE },
            { timeout: 15000 }
        ).then(function() {
            sentLinks[link] = true;
            saveSent();
            console.log('OK+IMG:', title.substring(0, 50));
        }).catch(function() {
            sendTextOnly(title, link);
        });
    } else {
        sendTextOnly(title, link);
    }
}

// Парсинг списка новостей
function getNewsList() {
    return axios.get('https://forbes.ua/news', {
        headers: HEADERS,
        timeout: 15000
    }).then(function(res) {
        var $ = cheerio.load(res.data);
        var items = [];

        $('a[href*="/news/"]').each(function(i, el) {
            var href = $(el).attr('href');
            var t = $(el).text().trim();

            if (t && t.length > 15 && href && href.indexOf('/news/') > -1) {
                var fullLink = href;
                if (fullLink.charAt(0) === '/') fullLink = 'https://forbes.ua' + fullLink;

                var exists = false;
                for (var j = 0; j < items.length; j++) {
                    if (items[j].link === fullLink) exists = true;
                }
                if (!exists) items.push({ title: t, link: fullLink });
            }
        });
        return items;
    }).catch(function(e) {
        console.log('HTML fail:', e.message);
        return [];
    });
}

// Главная проверка
function checkNews() {
    getNewsList().then(function(news) {
        if (!news || news.length === 0) {
            console.log('No news');
            return;
        }

        // ПЕРВЫЙ ЗАПУСК: не спамим, только запоминаем
        if (isFirstRun) {
            isFirstRun = false;

            if (Object.keys(sentLinks).length === 0) {
                // Памяти нет вообще — запоминаем всё молча
                for (var i = 0; i < news.length; i++) {
                    sentLinks[news[i].link] = true;
                }
                saveSent();
                console.log('SILENT START: remembered', news.length, 'links, no spam');
                return;
            }
            // Память есть из файла — продолжаем как обычно
        }

        // Ищем первую НОВУЮ новость
        var item = null;
        for (var k = 0; k < news.length; k++) {
            if (!sentLinks[news[k].link]) {
                item = news[k];
                break;
            }
        }

        if (!item) {
            console.log('Nothing new');
            return;
        }

        console.log('NEW:', item.title.substring(0, 50));
        getImageFromArticle(item.link).then(function(img) {
            sendNewsItem(item.title, item.link, img);
        });
    });
}

console.log('START Forbes Bot v3 (no old news spam)');
console.log('TOKEN:', BOT_TOKEN ? 'YES' : 'NO');
console.log('CHANNEL:', CHANNEL_ID ? 'YES' : 'NO');

loadSent();
checkNews();

setInterval(function() {
    checkNews();
}, 15 * 60 * 1000);
