const https = require('https');
const fs = require('fs');
const path = require('path');

const keywords = process.argv[2] || 'iphone madrid';
const query = encodeURIComponent(keywords + ' site:es.wallapop.com/item/');
const url = `https://html.duckduckgo.com/html/?q=${query}`;

// Use a simple UA to mimic a basic browser
const options = {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  }
};

console.log(`Ghost Browser: Searching DuckDuckGo for "${keywords}"...`);

https.get(url, options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    if (body.includes('bots use DuckDuckGo too')) {
      console.error('Ghost Browser: FAILED - Bot challenge detected.');
      process.exit(1);
    }

    // The Translation: Strip away all the code tags
    // This is part of the "Stealth Searcher" blueprint to avoid detection
    const cleanText = body.replace(/<[^>]*>?/gm, '\n');

    // The Delivery: Finally, it saves that clean text into a local file
    const memoryDir = path.join(process.cwd(), 'memory');
    if (!fs.existsSync(memoryDir)) {
      fs.mkdirSync(memoryDir, { recursive: true });
    }
    
    const outputPath = path.join(memoryDir, 'local_search_results.txt');
    fs.writeFileSync(outputPath, cleanText);
    
    console.log(`Ghost Browser: SUCCESS! Clean text saved to ${outputPath}`);
  });
}).on('error', (err) => {
  console.error(`Ghost Browser: Error - ${err.message}`);
  process.exit(1);
});
