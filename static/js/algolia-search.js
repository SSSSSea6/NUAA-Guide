// 初始化 Algolia 搜索
document.addEventListener('DOMContentLoaded', function() {
  // 从全局变量获取配置（将在HTML中设置）
  if (typeof window.algoliaConfig === 'undefined') {
    console.error('Algolia configuration not found');
    return;
  }

  const searchClient = algoliasearch(
    window.algoliaConfig.appId,
    window.algoliaConfig.searchKey
  );

  const search = instantsearch({
    indexName: window.algoliaConfig.indexName || 'nuaaguide',
    searchClient,
  });

  search.addWidgets([
    instantsearch.widgets.searchBox({
      container: '#search-box',
      placeholder: '输入课程名、老师或关键词搜索...',
    }),

    instantsearch.widgets.hits({
      container: '#hits',
      templates: {
        item: `
          <article>
            <a href="{{permalink}}" style="color: #0056b3; font-weight: bold;">
              <h4>{{#helpers.highlight}}{ "attribute": "title" }{{/helpers.highlight}}</h4>
            </a>
            <p style="color: #6c757d; margin-top: 4px;">{{#helpers.highlight}}{ "attribute": "summary" }{{/helpers.highlight}}</p>
            {{#file_url}}<small>下载资源</small>{{/file_url}}
          </article>
        `,
        empty: `没有找到与 "{{query}}" 相关的资料。`,
      },
    })
  ]);

  search.start();
});
