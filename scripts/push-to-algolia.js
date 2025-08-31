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

try {
  const records = JSON.parse(fs.readFileSync('public/index.json', 'utf8'));
  console.log(`找到 ${records.length} 条记录准备推送到 Algolia`);
  
  // 分批处理记录，避免超出大小限制
  const batchSize = 1000;
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    console.log(`处理批次 ${i / batchSize + 1}: ${batch.length} 条记录`);
    
    await index.saveObjects(batch);
    console.log(`批次 ${i / batchSize + 1} 已成功推送`);
  }
  
  console.log('所有记录已成功推送到 Algolia！');
  
  // 更新索引设置，确保可以返回更多结果
  await index.setSettings({
    paginationLimitedTo: 1000, // 允许返回最多1000条结果
    attributesForFaceting: ['filterOnly(tags)']
  });
  
  console.log('索引设置已更新');
} catch (err) {
  console.error('推送索引时出错:', err);
  process.exit(1);
}
