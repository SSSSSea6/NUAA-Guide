const algoliasearch = require('algoliasearch');
const fs = require('fs');

const APP_ID = process.env.ALGOLIA_APP_ID;
const ADMIN_KEY = process.env.ALGOLIA_ADMIN_API_KEY;
const INDEX_NAME = process.env.ALGOLIA_INDEX_NAME || 'nuaaguide';

if (!APP_ID || !ADMIN_KEY) {
  console.error("错误：Algolia 环境变量未设置。请在 GitHub Secrets 中设置 ALGOLIA_APP_ID 和 ALGOLIA_ADMIN_API_KEY。");
  process.exit(1);
}

const client = algoliasearch(APP_ID, ADMIN_KEY);
const index = client.initIndex(INDEX_NAME);

const records = JSON.parse(fs.readFileSync('public/index.json', 'utf8'));

index.replaceAllObjects(records)
  .then(() => console.log('搜索索引已成功推送到 Algolia！'))
  .catch(err => { console.error(err); process.exit(1); });
