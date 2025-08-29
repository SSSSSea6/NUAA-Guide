const searchClient = algoliasearch(
  'SMA85IWFQN',        // <--- ！！！在这里填入你自己的 Application ID
  'acba6f34201778549de792ebd57bea2c'  // <--- ！！！在这里填入你自己的 Search-Only API Key
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
        <a href=" " style="color: #0056b3; font-weight: bold;">
          <h4>{{#helpers.highlight}}{ "attribute": "title" }{{/helpers.highlight}}</h4>
        </a >
        <p style="color: #6c757d; margin-top: 4px;">{{#helpers.highlight}}{ "attribute": "summary" }{{/helpers.highlight}}</p >
      </article>
    `,
    empty: `没有找到与 "{{ query }}" 相关的资料。`,
  },
})
]);

search.start();
