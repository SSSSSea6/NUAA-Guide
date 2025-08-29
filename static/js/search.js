const searchClient = algoliasearch(
  'SMA85IWFQN',        // 确保这里是你自己的 Application ID
  '8a00c461ba4a78c16cb8862108e7e83a'  // 确保这里是你自己的 Search-Only API Key
);

const search = instantsearch({
  indexName: 'nuaaguide',
  searchClient,
});

search.addWidgets();

search.start();

