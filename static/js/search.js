// static/js/search.js
const searchClient = algoliasearch(
  'SMA85IWFQN',        // 替换为你的实际 Application ID
  '8a00c461ba4a78c16cb8862108e7e83a'   // 替换为你的实际 Search-Only API Key
);

const search = instantsearch({
  indexName: 'nuaaguide',
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

