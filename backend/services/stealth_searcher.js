const https = require('https');
const url = require('url');

async function get(targetUrl, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = url.parse(targetUrl);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.path,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        ...headers
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', (e) => reject(e));
    req.end();
  });
}

async function stealthSearch(keywords) {
  const query = encodeURIComponent(`site:es.wallapop.com/item/ ${keywords}`);
  
  console.error(`Stealth Searcher: Fetching session cookies...`);
  // 1. Get main page for cookies
  const landing = await get('https://duckduckgo.com/');
  const cookies = landing.headers['set-cookie'] ? landing.headers['set-cookie'].map(c => c.split(';')[0]).join('; ') : '';
  
  console.error(`Stealth Searcher: Performing search for "${keywords}"...`);
  // 2. Perform search on HTML endpoint
  const searchUrl = `https://html.duckduckgo.com/html/?q=${query}`;
  const searchResults = await get(searchUrl, { 'Cookie': cookies });

  if (searchResults.body.includes('bots use DuckDuckGo too')) {
    console.error('Stealth Searcher: BLOCKED by bot challenge.');
    process.exit(1);
  }

  // Use regex to find Wallapop URLs
  const links = [];
  const regex = /uddg=([^&"'> ]+)/g;
  let match;
  while ((match = regex.exec(searchResults.body)) !== null) {
    try {
      const decoded = decodeURIComponent(match[1]);
      if (decoded.includes('wallapop.com/item/') && !links.includes(decoded)) {
        links.push(decoded);
      }
    } catch (e) {}
  }

  if (links.length > 0) {
    console.log(links.join('\n'));
  } else {
    console.error('Stealth Searcher: No results found.');
  }
}

const keywords = process.argv[2] || 'iphone madrid';
stealthSearch(keywords);
