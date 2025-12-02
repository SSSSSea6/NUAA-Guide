const getQueryParams = () => new URLSearchParams(window.location.search);

const resolveEntryUrl = (entry, tab) => {
    if (entry?.url) return entry.url;
    if (entry?.permalink) return entry.permalink;
    if (entry?.path) return entry.path;
    if (entry?.slug) return `/${tab || "materials"}/${entry.slug}/`;
    if (entry?.title) return `/search/all?tab=${tab || "materials"}&q=${encodeURIComponent(entry.title)}`;
    return "#";
};

const buildMetaText = (entry, tab) => {
    const pieces = [];
    if (Array.isArray(entry?.subjects) && entry.subjects.length) {
        pieces.push(entry.subjects.slice(0, 2).join(" / "));
    } else if (tab === "subjects" && entry?.title) {
        pieces.push("科目");
    }
    if (Array.isArray(entry?.tags) && entry.tags.length) {
        pieces.push(entry.tags.slice(0, 2).join(" · "));
    }
    if (entry?.section) {
        pieces.push(entry.section);
    }
    if (entry?.date) {
        const d = new Date(entry.date);
        if (!Number.isNaN(d.valueOf())) {
            pieces.push(d.toISOString().split("T")[0]);
        }
    }
    return pieces.join(" · ");
};

const ensureSearchCard = (entry, tab) => {
    const target = resolveEntryUrl(entry, tab);
    const nodeName = target && target !== "#" ? "a" : "div";
    const card = document.createElement(nodeName);
    card.className = "search-card chat-card";
    if (nodeName === "a") {
        card.href = target;
    }
    const title = document.createElement("p");
    title.className = "chat-card__title";
    title.textContent = entry?.title || "未命名";
    card.appendChild(title);

    const metaText = buildMetaText(entry, tab);
    if (metaText) {
        const meta = document.createElement("p");
        meta.className = "chat-card__meta";
        meta.textContent = metaText;
        card.appendChild(meta);
    }

    if (entry?.summary) {
        const excerpt = document.createElement("p");
        excerpt.className = "chat-card__excerpt";
        excerpt.textContent = entry.summary;
        card.appendChild(excerpt);
    }
    return card;
};

window.NuaaSearchUI = window.NuaaSearchUI || {};
window.NuaaSearchUI.createCard = ensureSearchCard;

class SearchPage {
    constructor(root) {
        this.root = root;
        this.form = root.querySelector("[data-search-form]");
        this.input = root.querySelector("[data-search-input]");
        this.status = root.querySelector("[data-search-status]");
        this.results = root.querySelector("[data-search-results]");
        this.tabs = Array.from(root.querySelectorAll("[data-search-tab]"));
        this.backButton = root.querySelector("[data-search-back]");
        this.defaultTab = root.dataset.defaultTab || "materials";
        this.activeTab = this.defaultTab;
        this.query = "";
        this.token = 0;
        this.bindEvents();
        this.syncFromUrl();
        if (this.query) {
            this.runSearch();
        }
    }

    bindEvents() {
        if (this.form) {
            this.form.addEventListener("submit", (event) => {
                event.preventDefault();
                this.query = (this.input?.value || "").trim();
                this.updateUrl();
                this.runSearch();
            });
        }
        if (this.backButton) {
            this.backButton.addEventListener("click", () => {
                if (window.history.length > 1) {
                    window.history.back();
                } else {
                    const fallback = this.backButton.dataset.home || "/";
                    window.location.href = fallback;
                }
            });
        }
        this.tabs.forEach((button) => {
            button.addEventListener("click", () => {
                const tab = button.dataset.searchTab;
                if (!tab || tab === this.activeTab) return;
                this.activeTab = tab;
                this.updateTabsUI();
                this.updateUrl();
                if (this.query) {
                    this.runSearch();
                }
            });
        });

        window.addEventListener("popstate", () => {
            this.syncFromUrl();
            if (this.query) {
                this.runSearch();
            } else {
                this.clearResults();
            }
        });
    }

    syncFromUrl() {
        const params = getQueryParams();
        this.query = (params.get("q") || "").trim();
        this.activeTab = params.get("tab") || this.defaultTab;
        if (this.input) {
            this.input.value = this.query;
        }
        this.updateTabsUI();
        if (!this.query) {
            this.setStatus("请输入关键词开始检索");
        }
    }

    updateTabsUI() {
        this.tabs.forEach((button) => {
            const isActive = button.dataset.searchTab === this.activeTab;
            button.classList.toggle("is-active", isActive);
            button.setAttribute("aria-selected", isActive ? "true" : "false");
            button.setAttribute("tabindex", isActive ? "0" : "-1");
        });
    }

    updateUrl() {
        const params = new URLSearchParams();
        if (this.query) {
            params.set("q", this.query);
        }
        if (this.activeTab && this.activeTab !== this.defaultTab) {
            params.set("tab", this.activeTab);
        }
        const next = params.toString();
        const url = next ? `?${next}` : window.location.pathname;
        window.history.replaceState({}, "", url);
    }

    setStatus(message) {
        if (this.status) {
            this.status.textContent = message;
        }
    }

    clearResults() {
        if (this.results) {
            this.results.innerHTML = "";
        }
    }

    async runSearch() {
        if (!this.query) {
            this.setStatus("请输入关键词开始检索");
            this.clearResults();
            return;
        }

        if (!window.NuaaSearch || typeof window.NuaaSearch.runSearch !== "function") {
            this.setStatus("搜索模块尚未就绪");
            return;
        }

        const token = ++this.token;
        this.setStatus("正在检索中");
        this.clearResults();

        try {
            const data = await window.NuaaSearch.runSearch(this.query, {
                buckets: [this.activeTab]
            });
            if (token !== this.token) {
                return;
            }
            const items = Array.isArray(data?.[this.activeTab]) ? data[this.activeTab] : [];
            if (items.length === 0) {
                this.setStatus(`没有找到与「${this.query}」相关的结果。`);
                return;
            }
            this.setStatus(`共 ${items.length} 条结果`);
            this.renderList(items);
        } catch (error) {
            console.error("[search-page] runSearch failed:", error);
            this.setStatus("检索失败，请稍后重试");
        }
    }

    renderList(items) {
        if (!this.results) return;
        const fragment = document.createDocumentFragment();
        const createCard =
            window.NuaaSearchUI?.createCard ||
            ((entry) => {
                const fallback = document.createElement("div");
                fallback.className = "chat-card";
                fallback.textContent = entry.title || "未命名";
                return fallback;
            });
        items.forEach((item) => {
            fragment.appendChild(createCard(item, this.activeTab));
        });
        this.results.appendChild(fragment);
    }
}

const bootSearchPages = () => {
    document.querySelectorAll("[data-search-page]").forEach((root) => {
        if (root.dataset.searchPageInitialised === "true") {
            return;
        }
        root.dataset.searchPageInitialised = "true";
        new SearchPage(root);
    });
};

const initSearchPage = () => {
    const start = () => bootSearchPages();
    if (window.NuaaSearchReady && typeof window.NuaaSearchReady.then === "function") {
        window.NuaaSearchReady.then(start).catch(start);
    } else {
        start();
    }
};

window.initSearchPage = initSearchPage;

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSearchPage, { once: true });
} else {
    initSearchPage();
}
