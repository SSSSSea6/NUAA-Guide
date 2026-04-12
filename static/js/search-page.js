const getQueryParams = () => new URLSearchParams(window.location.search);

const SECTION_LABELS = {
    compass: "指南针",
    guides: "实用工具",
    materials: "文件",
    subjects: "科目"
};
const TAB_LABELS = {
    all: "全部",
    materials: "文件",
    subjects: "科目",
    tools: "工具"
};
const ALLOWED_TABS = new Set(["all", "subjects", "materials", "tools"]);
const RESULT_BUCKET_ORDER = {
    materials: 0,
    subjects: 1,
    tools: 2
};
const SEARCH_READY_TIMEOUT_MS = 4000;
const SEARCH_READY_POLL_MS = 50;
const RESULTS_PAGE_SIZE = 32;
const RESULTS_SCROLL_THRESHOLD = 120;

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

    if (tab && TAB_LABELS[tab] && tab !== "all") {
        pieces.push(TAB_LABELS[tab]);
    }

    if (tab === "subjects" && Number.isFinite(entry?.count)) {
        pieces.push(`${entry.count} 份资料`);
    } else if (Array.isArray(entry?.subjects) && entry.subjects.length) {
        pieces.push(entry.subjects[0]);
    }

    if (entry?.section && tab === "tools") {
        pieces.push(SECTION_LABELS[entry.section] || entry.section);
    }

    if (entry?.file_type) {
        pieces.push(String(entry.file_type).toUpperCase());
    }

    return Array.from(new Set(pieces.filter(Boolean))).slice(0, 3).join(" · ");
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
        this.title = root.querySelector("[data-search-title]");
        this.form = root.querySelector("[data-search-form]");
        this.input = root.querySelector("[data-search-input]");
        this.status = root.querySelector("[data-search-status]");
        this.resultsShell = root.querySelector("[data-search-results-shell]");
        this.resultsViewport = root.querySelector("[data-search-scroll]");
        this.results = root.querySelector("[data-search-results]");
        this.sentinel = root.querySelector("[data-search-sentinel]");
        this.tabs = Array.from(root.querySelectorAll("[data-search-tab]"));
        this.backButton = root.querySelector("[data-search-back]");
        this.defaultTab = root.dataset.defaultTab || "all";
        this.activeTab = this.defaultTab;
        this.query = "";
        this.token = 0;
        this.allItems = [];
        this.visibleCount = 0;
        this.observer = null;
        this.loadMoreQueued = false;

        this.bindEvents();
        this.setupInfiniteScroll();
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

        if (this.resultsViewport) {
            this.resultsViewport.addEventListener("scroll", () => {
                this.queueLoadMoreCheck();
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

    setupInfiniteScroll() {
        if (!this.resultsViewport || !this.sentinel || typeof IntersectionObserver === "undefined") {
            return;
        }

        this.observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        this.showMoreResults();
                    }
                });
            },
            {
                root: this.resultsViewport,
                rootMargin: `0px 0px ${RESULTS_SCROLL_THRESHOLD}px 0px`,
                threshold: 0.01
            }
        );

        this.observer.observe(this.sentinel);
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
            this.setHeading(false);
            this.setStatus("");
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
            this.status.hidden = !message;
        }
    }

    setHeading(hasResults) {
        if (this.title) {
            this.title.textContent = hasResults ? "搜索结果" : "搜索";
        }
    }

    updateResultsSummary() {
        const total = this.allItems.length;
        if (!total) {
            return;
        }

        this.setHeading(true);
        this.setStatus("");
    }

    updateResultsShell() {
        if (!this.resultsShell) {
            return;
        }
        this.resultsShell.hidden = this.allItems.length === 0;
    }

    clearResults() {
        if (this.results) {
            this.results.innerHTML = "";
        }
        this.allItems = [];
        this.visibleCount = 0;
        if (this.resultsViewport) {
            this.resultsViewport.scrollTop = 0;
        }
        this.updateResultsShell();
    }

    collectItems(data) {
        if (!data || typeof data !== "object") {
            return [];
        }

        if (this.activeTab !== "all") {
            const scopedItems = Array.isArray(data[this.activeTab]) ? data[this.activeTab] : [];
            return scopedItems.map((item) => ({ ...item, _bucket: this.activeTab }));
        }

        return ["materials", "subjects", "tools"]
            .flatMap((bucket) =>
                (Array.isArray(data[bucket]) ? data[bucket] : []).map((item) => ({
                    ...item,
                    _bucket: bucket
                }))
            )
            .sort((left, right) => {
                const scoreDelta = (right?._score || 0) - (left?._score || 0);
                if (scoreDelta !== 0) {
                    return scoreDelta;
                }

                const bucketDelta =
                    (RESULT_BUCKET_ORDER[left?._bucket] ?? Number.MAX_SAFE_INTEGER) -
                    (RESULT_BUCKET_ORDER[right?._bucket] ?? Number.MAX_SAFE_INTEGER);
                if (bucketDelta !== 0) {
                    return bucketDelta;
                }

                return String(left?.title || "").localeCompare(String(right?.title || ""), "zh-CN");
            });
    }

    showMoreResults() {
        if (!this.allItems.length || this.visibleCount >= this.allItems.length) {
            return;
        }

        const start = this.visibleCount;
        const end = Math.min(start + RESULTS_PAGE_SIZE, this.allItems.length);
        this.visibleCount = end;
        this.renderList(this.allItems.slice(start, end), true);
        this.updateResultsSummary();
        this.queueLoadMoreCheck();
    }

    queueLoadMoreCheck() {
        if (!this.resultsViewport || this.loadMoreQueued) {
            return;
        }

        this.loadMoreQueued = true;
        window.requestAnimationFrame(() => {
            this.loadMoreQueued = false;
            this.maybeLoadMore();
        });
    }

    maybeLoadMore() {
        if (!this.resultsViewport || this.visibleCount >= this.allItems.length) {
            return;
        }

        const { scrollTop, clientHeight, scrollHeight } = this.resultsViewport;
        const distanceToBottom = scrollHeight - scrollTop - clientHeight;
        const needsMore =
            scrollHeight <= clientHeight + RESULTS_SCROLL_THRESHOLD ||
            distanceToBottom <= RESULTS_SCROLL_THRESHOLD;

        if (needsMore) {
            this.showMoreResults();
        }
    }

    async runSearch() {
        if (!this.query) {
            this.setHeading(false);
            this.setStatus("");
            this.clearResults();
            return;
        }

        const searchReady = await waitForSearchRuntime();
        if (!searchReady) {
            this.setHeading(false);
            this.setStatus("搜索暂不可用");
            return;
        }

        const token = ++this.token;
        this.setHeading(false);
        this.setStatus("搜索中…");
        this.clearResults();

        try {
            const searchScope = this.activeTab === "all" ? {} : { buckets: [this.activeTab] };
            const data = await window.NuaaSearch.runSearch(this.query, searchScope);

            if (token !== this.token) {
                return;
            }

            const items = this.collectItems(data);
            if (items.length === 0) {
                this.setHeading(false);
                this.setStatus("未找到结果");
                this.clearResults();
                return;
            }

            this.allItems = items;
            this.updateResultsShell();
            this.visibleCount = 0;
            this.renderList([]);
            this.showMoreResults();
            this.updateResultsSummary();
        } catch (error) {
            console.error("[search-page] runSearch failed:", error);
            this.setHeading(false);
            this.setStatus("搜索失败，请稍后重试");
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
            fragment.appendChild(createCard(item, item?._bucket || this.activeTab));
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
