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
        <article style="border: 1px solid #ddd; padding: 15px; margin-bottom: 10px; border-radius: 5px;">
          <a href=" " style="color: #0056b3; font-weight: bold; text-decoration: none;">
            <h4 style="margin: 0 0 8px 0;">{{#helpers.highlight}}{ "attribute": "title" }{{/helpers.highlight}}</h4>
          </a >
          <p style="color: #666; margin: 0;">{{#helpers.highlight}}{ "attribute": "summary" }{{/helpers.highlight}}</p >
        </article>
      `,
      empty: `<p>没有找到与 "{{ query }}" 相关的资料。</p >`,
    },
  })
]);

search.start();

