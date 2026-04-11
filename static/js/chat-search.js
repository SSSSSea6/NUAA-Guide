// UTF-8
(function () {
  const STORAGE_KEY = 'nuaa-chat-thread';

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

  const storage = {
    get() { try { return localStorage.getItem(STORAGE_KEY) || ''; } catch { return ''; } },
    set(v) { try { localStorage.setItem(STORAGE_KEY, v || ''); } catch {} },
    remove() { try { localStorage.removeItem(STORAGE_KEY); } catch {} },
  };

  const typewriterHtml = async (target, html, { cps = 28, startDelay = [1000, 1800] } = {}) => {
    const tpl = document.createElement('template');
    tpl.innerHTML = (html || '').trim();
    const frag = tpl.content;
    const walker = document.createTreeWalker(frag, NodeFilter.SHOW_TEXT);
    const nodes = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
    nodes.forEach((t) => { t.__full = t.nodeValue; t.nodeValue = ''; });
    target.appendChild(frag);
    await sleep(Array.isArray(startDelay) ? rand(startDelay[0], startDelay[1]) : +startDelay || 0);
    const interval = Math.max(12, Math.floor(1000 / Math.max(1, cps)));
    for (const t of nodes) {
      const s = t.__full || '';
      for (let i = 1; i <= s.length; i += 1) { t.nodeValue = s.slice(0, i); await sleep(interval); }
    }
  };

  const revealListStaggered = async (root, items, gap = 75) => {
    items.forEach((el) => { el.style.opacity = '0'; el.style.transform = 'translateY(6px)'; });
    root.append(...items);
    for (const el of items) { await sleep(gap); el.style.transition = 'opacity .2s ease, transform .2s ease'; el.style.opacity = '1'; el.style.transform = 'none'; }
  };

  class ChatSearch {
    constructor(root) {
      this.root = root;
      this.thread = root.querySelector('[data-chat-thread]');
      this.form = root.querySelector('[data-chat-form]');
      this.input = root.querySelector('[data-chat-input]');
      this.introBlocks = Array.from(root.querySelectorAll('[data-chat-intro]'));
      this.token = 0;
      this.busy = false;
      this.restore();
      this.syncIntro();
      this.bind();
      registerAutoCleanup();
    }

    bind() {
      this.form?.addEventListener('submit', (e) => {
        e.preventDefault();
        if (e.stopPropagation) e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        this.submit();
      });
      this.input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          // Route through submit event to avoid double runs
          if (typeof this.form?.requestSubmit === 'function') {
            this.form.requestSubmit();
          } else if (this.form) {
            this.form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
          }
        }
      });
      this.input?.addEventListener('input', () => this.autogrow());
      this.autogrow();
    }

    autogrow() { if (!this.input) return; this.input.style.height = 'auto'; this.input.style.height = `${Math.min(this.input.scrollHeight, 220)}px`; }

    syncIntro() {
      const hasMessages = !!this.thread && this.thread.children.length > 0;
      this.introBlocks.forEach((el) => {
        if (el && typeof el.classList?.toggle === 'function') {
          el.classList.toggle('is-hidden', hasMessages);
        }
      });
    }

    persist() { if (this.thread) storage.set(this.thread.innerHTML || ''); }
    restore() { if (this.thread) { const html = storage.get(); if (html) this.thread.innerHTML = html; } }

    async submit() {
      if (this.busy) return;
      const q = (this.input?.value || '').trim(); if (!q) return;
      this.busy = true;
      this.root?.classList?.add('is-busy');
      const user = document.createElement('div'); user.className = 'chat-message chat-message--user'; user.innerHTML = `<p>${q.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>`; this.thread.appendChild(user);
      this.syncIntro();
      this.scroll(); this.persist(); this.input.value = ''; this.autogrow();

      const sys = document.createElement('div'); sys.className = 'chat-message chat-message--system chat-message--thinking'; sys.textContent = '正在为你检索…'; this.thread.appendChild(sys);
      this.scroll(); this.persist();

      const token = ++this.token;
      try {
        const data = await (window.NuaaSearch?.runSearch?.(q) || Promise.resolve(null));
        if (token !== this.token) return;
        sys.classList.remove('chat-message--thinking'); sys.textContent = '';
        const typed = document.createElement('div'); typed.className = 'chat-result__typed'; sys.appendChild(typed);
        const total = ['subjects','materials','tools'].reduce((n,k)=>n+(Array.isArray(data?.[k])?data[k].length:0),0);
        if (!total) { await typewriterHtml(typed, `<p>没找到与「${q}」相关的资源。</p>`); this.persist(); return; }
        await typewriterHtml(typed, `<p>为「${q}」找到若干条资源，并按相关性排序。</p>`);

        const block = document.createElement('div'); block.className = 'chat-result__block'; const grid = document.createElement('div'); grid.className = 'chat-result__grid'; block.appendChild(grid); sys.appendChild(block);
        const resolveLink = (item, tab) => {
          const isMaterial = tab === 'materials' || item?.type === 'material';
          if (isMaterial && item?.file_url) return item.file_url;
          return item?.url || '#';
        };
        const col = (title, arr, tab) => { const c=document.createElement('div'); c.className='chat-col'; const h=document.createElement('h4'); h.textContent=title; c.appendChild(h); const list=document.createElement('div'); list.className='chat-col__list'; c.appendChild(list); const items=(arr||[]).slice(0,3).map((it)=>{ const href=resolveLink(it, tab); const a=document.createElement('a'); a.className='chat-card'; a.href=href||'#'; if(/^https?:\/\//i.test(href)){ a.target='_blank'; a.rel='noopener noreferrer'; } const t=document.createElement('p'); t.className='chat-card__title'; t.textContent=it.title||'未命名'; a.appendChild(t); const m=document.createElement('p'); m.className='chat-card__meta'; m.textContent = tab==='materials'?(it.subjects?.[0]||'学习资料'):(tab==='tools'?(it.section||'工具'):'科目合集'); a.appendChild(m); return a; }); if (items.length){ revealListStaggered(list, items, rand(60, 90)); } else { const p=document.createElement('p'); p.className='chat-col__empty'; p.textContent='暂无匹配'; list.appendChild(p);} const more=document.createElement('a'); more.className='chat-col__more'; more.href=`/search/all?tab=${tab}&q=${encodeURIComponent(q)}`; more.textContent='查看更多'; c.appendChild(more); return c; };
        grid.appendChild(col('科目', data?.subjects||[], 'subjects'));
        grid.appendChild(col('文件', data?.materials||[], 'materials'));
        const toolsBlock=document.createElement('div'); toolsBlock.className='chat-result__block'; const th=document.createElement('h4'); th.textContent='工具'; toolsBlock.appendChild(th); const tl=document.createElement('div'); tl.className='chat-tools__list'; toolsBlock.appendChild(tl); const tItems=(data?.tools||[]).slice(0,3).map((it)=>{ const a=document.createElement('a'); a.className='chat-card'; a.href=it.url||'#'; const t=document.createElement('p'); t.className='chat-card__title'; t.textContent=it.title||'未命名'; a.appendChild(t); const m=document.createElement('p'); m.className='chat-card__meta'; m.textContent=it.section||'工具'; a.appendChild(m); return a; }); if (tItems.length){ revealListStaggered(tl, tItems, rand(70,90)); } else { const p=document.createElement('p'); p.className='chat-col__empty'; p.textContent='暂无匹配的工具'; tl.appendChild(p);} const tm=document.createElement('a'); tm.className='chat-tools__more'; tm.href=`/search/all?tab=tools&q=${encodeURIComponent(q)}`; tm.textContent='查看更多工具'; toolsBlock.appendChild(tm); sys.appendChild(toolsBlock);

        this.scroll(); this.persist();
      } catch (e) {
        sys.classList.remove('chat-message--thinking'); sys.classList.add('chat-message--error'); sys.textContent = '检索时遇到问题，请稍后再试。'; this.persist();
      } finally {
        this.busy = false;
        this.root?.classList?.remove('is-busy');
      }
    }

    scroll() { const last = this.thread?.lastElementChild; if (!last) return; requestAnimationFrame(() => last.scrollIntoView({ behavior: 'smooth', block: 'end' })); }
  }

  const registerAutoCleanup = (() => {
    let registered = false;
    return () => {
      if (registered || typeof window === 'undefined') return;
      registered = true;
      const wipe = () => storage.remove();
      window.addEventListener('pagehide', wipe, { capture: true });
      window.addEventListener('beforeunload', wipe, { capture: true });
    };
  })();

  function boot() {
    document.querySelectorAll('[data-chat-search]').forEach((root) => {
      if (root.dataset.chatInitialised === 'true') return;
      root.dataset.chatInitialised = 'true';
      new ChatSearch(root);
    });
  }

  window.initChatSearch = boot;

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', boot, { once: true }); } else { boot(); }
})();
