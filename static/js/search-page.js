const getQueryParams = () => new URLSearchParams(window.location.search);

const SECTION_LABELS = {
    compass: "指南针",
    guides: "实用工具",
    materials: "文件",
    subjects: "科目"
};
const ALLOWED_TABS = new Set(["subjects", "materials", "tools"]);
const SEARCH_READY_TIMEOUT_MS = 4000;
const SEARCH_READY_POLL_MS = 50;
const RESULTS_PAGE_SIZE = 50;

const hasSearchRuntime = () =>
    Boolean(window.NuaaSearch && typeof window.NuaaSearch.runSearch === "function");

const waitForSearchRuntime = async (timeoutMs = SEARCH_READY_TIMEOUT_MS) => {
    if (hasSearchRuntime()) {
        return true;
    }

    if (window.NuaaSearchReady && typeof window.NuaaSearchReady.then === "function") {
        try {
            await Promise.race([
                window.NuaaSearchReady,
                new Promise((resolve) => setTimeout(resolve, timeoutMs))
            ]);
        } catch {
            // Fall through to polling; the caller will handle a final failure.
        }
        if (hasSearchRuntime()) {
            return true;
        }
    }

    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        await new Promise((resolve) => setTimeout(resolve, SEARCH_READY_POLL_MS));
        if (hasSearchRuntime()) {
            return true;
        }
    }

    return hasSearchRuntime();
};

const resolveEntryUrl = (entry, tab) => {
    const isMaterial = tab === "materials" || entry?.type === "material";
    if (isMaterial && entry?.file_url) return entry.file_url;
    if (entry?.url) return entry.url;
    if (entry?.permalink) return entry.permalink;
    if (entry?.path) return entry.path;
    if (entry?.slug) return `/${tab || "materials"}/${entry.slug}/`;
    if (entry?.title) return `/search/all?tab=${tab || "materials"}&q=${encodeURIComponent(entry.title)}`;
    return "#";
};

const formatDate = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) {
        return "";
    }
    return date.toISOString().split("T")[0];
};

const pickExcerpt = (entry) => {
    if (typeof entry?.summary === "string" && entry.summary.trim()) {
        return entry.summary.trim();
    }
    if (typeof entry?.excerpt === "string" && entry.excerpt.trim()) {
        return entry.excerpt.trim();
    }
    return "";
};

const buildMetaText = (entry, tab) => {
    const pieces = [];

    if (tab === "subjects" && Number.isFinite(entry?.count)) {
        pieces.push(`${entry.count} 份资料`);
    } else if (Array.isArray(entry?.subjects) && entry.subjects.length) {
        pieces.push(entry.subjects.slice(0, 2).join(" / "));
    }

    if (Array.isArray(entry?.tags) && entry.tags.length) {
        pieces.push(entry.tags.slice(0, 2).join(" · "));
    }

    if (entry?.section) {
        pieces.push(SECTION_LABELS[entry.section] || entry.section);
    }

    if (entry?.file_type) {
        pieces.push(String(entry.file_type).toUpperCase());
    }

    const formattedDate = formatDate(entry?.date);
    if (formattedDate) {
        pieces.push(formattedDate);
    }

    return pieces.join(" · ");
};

const ensureSearchCard = (entry, tab) => {
    const target = resolveEntryUrl(entry, tab);
    const nodeName = target && target !== "#" ? "a" : "div";
    const card = document.createElement(nodeName);
    card.className = "search-card";

    if (nodeName === "a") {
        card.href = target;
        if (/^https?:\/\//i.test(target)) {
            card.target = "_blank";
            card.rel = "noopener noreferrer";
        }
    }

    const title = document.createElement("p");
    title.className = "search-card__title";
    title.textContent = entry?.title || "未命名";
    card.appendChild(title);

    const metaText = buildMetaText(entry, tab);
    if (metaText) {
        const meta = document.createElement("p");
        meta.className = "search-card__meta";
        meta.textContent = metaText;
        card.appendChild(meta);
    }

    const excerptText = pickExcerpt(entry);
    if (excerptText) {
        const excerpt = document.createElement("p");
        excerpt.className = "search-card__excerpt";
        excerpt.textContent = excerptText;
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
        this.controls = root.querySelector("[data-search-controls]");
        this.moreButton = root.querySelector("[data-search-more]");
        this.tabs = Array.from(root.querySelectorAll("[data-search-tab]"));
        this.backButton = root.querySelector("[data-search-back]");
        this.defaultTab = root.dataset.defaultTab || "materials";
        this.activeTab = this.defaultTab;
        this.query = "";
        this.token = 0;
        this.allItems = [];
        this.visibleCount = 0;

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
                    const fallback = this.backButton.dataset.home || "/search/";
                    window.location.href = fallback;
                }
            });
        }

        if (this.moreButton) {
            this.moreButton.addEventListener("click", () => {
                this.showMoreResults();
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
        const requestedTab = params.get("tab") || this.defaultTab;
        this.activeTab = ALLOWED_TABS.has(requestedTab) ? requestedTab : this.defaultTab;

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

    updateResultsSummary() {
        const total = this.allItems.length;
        if (!total) {
            return;
        }

        if (this.visibleCount >= total) {
            this.setStatus(`找到 ${total} 条结果`);
            return;
        }

        this.setStatus(`找到 ${total} 条结果，当前显示 ${this.visibleCount} 条`);
    }

    updateLoadMoreUI() {
        if (!this.controls || !this.moreButton) {
            return;
        }

        const remaining = this.allItems.length - this.visibleCount;
        const shouldShow = remaining > 0;
        this.controls.hidden = !shouldShow;
        this.moreButton.hidden = !shouldShow;

        if (shouldShow) {
            this.moreButton.textContent = `加载更多（剩余 ${remaining} 条）`;
        }
    }

    clearResults() {
        if (this.results) {
            this.results.innerHTML = "";
        }
        this.allItems = [];
        this.visibleCount = 0;
        this.updateLoadMoreUI();
    }

    showMoreResults() {
        if (!this.allItems.length) {
            return;
        }

        const start = this.visibleCount;
        const end = Math.min(start + RESULTS_PAGE_SIZE, this.allItems.length);
        this.visibleCount = end;
        this.renderList(this.allItems.slice(start, end), true);
        this.updateResultsSummary();
        this.updateLoadMoreUI();
    }

    async runSearch() {
        if (!this.query) {
            this.setStatus("请输入关键词开始检索");
            this.clearResults();
            return;
        }

        const searchReady = await waitForSearchRuntime();
        if (!searchReady) {
            this.setStatus("搜索模块尚未就绪，请稍后重试");
            return;
        }

        const token = ++this.token;
        this.setStatus("正在检索…");
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
                this.setStatus(`没有找到与“${this.query}”相关的结果`);
                this.clearResults();
                return;
            }

            this.allItems = items;
            this.visibleCount = Math.min(RESULTS_PAGE_SIZE, items.length);
            this.renderList(this.allItems.slice(0, this.visibleCount));
            this.updateResultsSummary();
            this.updateLoadMoreUI();
        } catch (error) {
            console.error("[search-page] runSearch failed:", error);
            this.setStatus("检索失败，请稍后重试");
            this.clearResults();
        }
    }

    renderList(items, append = false) {
        if (!this.results) return;
        if (!append) {
            this.results.innerHTML = "";
        }

        const fragment = document.createDocumentFragment();
        const createCard =
            window.NuaaSearchUI?.createCard ||
            ((entry) => {
                const fallback = document.createElement("div");
                fallback.className = "search-card";
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
    waitForSearchRuntime().finally(() => {
        bootSearchPages();
    });
};

window.initSearchPage = initSearchPage;

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSearchPage, { once: true });
} else {
    initSearchPage();
}
