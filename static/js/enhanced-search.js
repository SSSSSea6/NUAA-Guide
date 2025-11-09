const SECTION_LABELS = {
    guides: "实用工具",
    materials: "学习资料",
    software: "常用软件下载",
    links: "常用网址跳转",
    subjects: "学习资料",
    other: "其他资源"
};

const RESULT_LIMIT = 200;
const ASCII_PATTERN = /^[\x00-\x7F]+$/;
const UNIVERSAL_SCOPE = [];

let manifestPromise;
let flexSearchLibPromise;
let flexSearchIndexPromise;
const pinyinCache = new Map();
const manifestCache = new Map();
let flexStore = null;

const debounce = (fn, delay = 220) => {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
};

const loadFlexSearchLib = async () => {
    if (window.FlexSearch) {
        return window.FlexSearch;
    }
    if (!flexSearchLibPromise) {
        flexSearchLibPromise = new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = "/js/vendor/flexsearch.bundle.min.js";
            script.async = true;
            script.onload = () => resolve(window.FlexSearch || null);
            script.onerror = (error) => reject(error);
            document.head.appendChild(script);
        })
            .then((library) => {
                if (!library) {
                    throw new Error("FlexSearch global missing");
                }
                return library;
            })
            .catch((error) => {
                console.error("[search] FlexSearch failed to load:", error);
                return null;
            });
    }
    return flexSearchLibPromise;
};

const loadManifest = async () => {
    if (!manifestPromise) {
        manifestPromise = fetch("/data/search-manifest.json", { credentials: "same-origin" })
            .then((response) => (response.ok ? response.json() : []))
            .catch(() => []);
    }
    return manifestPromise;
};

const normaliseText = (value) => (value || "").toLowerCase();

const getManifestTokens = (entry) => {
    if (manifestCache.has(entry.url)) {
        return manifestCache.get(entry.url);
    }
    const tokens = {
        title: normaliseText(entry.title),
        summary: normaliseText(entry.summary),
        tags: Array.isArray(entry.tags) ? entry.tags.map((tag) => normaliseText(tag)) : []
    };
    manifestCache.set(entry.url, tokens);
    return tokens;
};

const loadPinyin = async () => {
    if (window.pinyinPro) {
        return window.pinyinPro;
    }
    if (window.pinyinProReady) {
        try {
            await window.pinyinProReady;
            return window.pinyinPro || null;
        } catch {
            return null;
        }
    }
    return null;
};

const normaliseQuery = (value) => value.trim();

const getSectionFromUrl = (url) => {
    if (!url) return "other";
    const relative = url.replace(/^https?:\/\/[^/]+/, "");
    const clean = relative.replace(/^\//, "");
    const [segment] = clean.split("/");
    return segment || "other";
};

const matchesSection = (section, allowed) => {
    if (!allowed || allowed.length === 0) {
        return true;
    }
    return allowed.includes(section);
};

const buildFlexSearchIndex = async () => {
    if (!flexSearchIndexPromise) {
        flexSearchIndexPromise = Promise.all([loadFlexSearchLib(), loadManifest()])
            .then(([FlexSearch, manifest]) => {
                if (!FlexSearch || !Array.isArray(manifest) || manifest.length === 0) {
                    return null;
                }

                const index = new FlexSearch.Index({
                    tokenize: "forward",
                    encode: false,
                    cache: 100,
                    resolution: 9
                });

                flexStore = new Map();

                for (const entry of manifest) {
                    if (!entry || !entry.url) {
                        continue;
                    }

                    const section = (entry.section || "other").toLowerCase();
                    const text = [
                        entry.title || "",
                        entry.summary || "",
                        Array.isArray(entry.tags) ? entry.tags.join(" ") : "",
                        section
                    ]
                        .join(" ")
                        .trim();

                    if (text) {
                        index.add(entry.url, text);
                    } else {
                        index.add(entry.url, entry.url);
                    }

                    flexStore.set(entry.url, {
                        url: entry.url,
                        title: entry.title || entry.url,
                        excerpt: entry.summary || "",
                        section
                    });
                }

                return index;
            })
            .catch((error) => {
                console.error("[search] Failed to build FlexSearch index:", error);
                return null;
            });
    }

    const index = await flexSearchIndexPromise;
    if (!index) {
        flexStore = null;
        flexSearchIndexPromise = null;
    }
    return index;
};

const normaliseFlexResult = (item) => {
    if (!item) return null;
    if (typeof item === "string" || typeof item === "number") {
        return String(item);
    }
    if (typeof item === "object") {
        if (typeof item.id === "string" || typeof item.id === "number") {
            return String(item.id);
        }
        if (Array.isArray(item.result) && item.result.length) {
            const nested = item.result[0];
            if (nested && (typeof nested === "string" || typeof nested === "number")) {
                return String(nested);
            }
            if (nested && typeof nested === "object" && nested.id) {
                return String(nested.id);
            }
        }
    }
    return null;
};

const searchFlexIndex = async (query, sections) => {
    const index = await buildFlexSearchIndex();
    if (!index || !flexStore || flexStore.size === 0) {
        return [];
    }

    let ids = [];
    try {
        ids = index.search(query, { limit: Math.max(RESULT_LIMIT * 2, 40) }) || [];
    } catch (error) {
        console.warn("[search] FlexSearch query failed:", error);
        return [];
    }

    if (!Array.isArray(ids)) {
        ids = [ids];
    }

    const results = [];
    for (const raw of ids) {
        const id = normaliseFlexResult(raw);
        if (!id) continue;
        const record = flexStore.get(id);
        if (!record) continue;

        if (!matchesSection(record.section, sections)) {
            continue;
        }

        results.push({
            ...record,
            matchType: "flex"
        });

        if (results.length >= RESULT_LIMIT) {
            break;
        }
    }

    return results;
};

const computePinyinVariants = async (text) => {
    if (!text) return null;
    if (pinyinCache.has(text)) {
        return pinyinCache.get(text);
    }

    const pinyinLib = await loadPinyin();
    if (!pinyinLib) return null;

    const syllables = pinyinLib
        .pinyin(text, { toneType: "none", type: "array" })
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);

    if (syllables.length === 0) return null;

    const full = syllables.join("");
    const initials = syllables.map((item) => item[0] || "").join("");

    const variants = { full, initials };
    pinyinCache.set(text, variants);
    return variants;
};

const searchByPinyin = async (query, sections) => {
    const manifest = await loadManifest();
    if (!manifest.length) {
        return [];
    }

    const normalised = query.replace(/\s+/g, "").toLowerCase();
    const matches = [];

    for (const entry of manifest) {
        if (!matchesSection(entry.section, sections)) {
            continue;
        }

        const variants = await computePinyinVariants(entry.title);
        if (!variants) continue;

        const matchByTitle =
            variants.full.includes(normalised) || variants.initials.includes(normalised);

        let matchByTags = false;
        if (!matchByTitle && entry.tags?.length) {
            for (const tag of entry.tags) {
                const tagVariants = await computePinyinVariants(tag);
                if (!tagVariants) continue;
                if (
                    tagVariants.full.includes(normalised) ||
                    tagVariants.initials.includes(normalised)
                ) {
                    matchByTags = true;
                    break;
                }
            }
        }

        if (matchByTitle || matchByTags) {
            matches.push({
                url: entry.url,
                title: entry.title,
                excerpt: entry.summary || "",
                section: entry.section || "other",
                matchType: "pinyin"
            });
        }
        if (matches.length >= RESULT_LIMIT) {
            break;
        }
    }

    return matches;
};

const searchManifest = async (query, sections) => {
    const manifest = await loadManifest();
    if (!manifest.length) {
        return [];
    }

    const normalised = normaliseText(query);
    const matches = [];

    for (const entry of manifest) {
        const section = (entry.section || "other").toLowerCase();
        if (!matchesSection(section, sections)) {
            continue;
        }

        const tokens = getManifestTokens(entry);
        const inTitle = tokens.title.includes(normalised);
        const inSummary = !inTitle && tokens.summary.includes(normalised);
        const inTags = !inTitle && !inSummary && tokens.tags.some((tag) => tag.includes(normalised));

        if (inTitle || inSummary || inTags) {
            matches.push({
                url: entry.url,
                title: entry.title,
                excerpt: entry.summary,
                section,
                matchType: "keyword"
            });
        }

        if (matches.length >= RESULT_LIMIT) {
            break;
        }
    }

    return matches;
};

const mergeByUrl = (primary, secondary) => {
    const seen = new Set(primary.map((item) => item.url));
    const merged = [...primary];
    for (const item of secondary) {
        if (!seen.has(item.url)) {
            merged.push(item);
            seen.add(item.url);
        }
    }
    return merged.slice(0, RESULT_LIMIT);
};

const getLabelForSection = (section) => SECTION_LABELS[section] || SECTION_LABELS.other;

const updateStatus = (element, message) => {
    if (element) {
        element.textContent = message;
    }
};

const renderResults = (context, results, query) => {
    const { list, status, panel, defaultStatus } = context;

    if (list) {
        list.innerHTML = "";
    }

    if (panel) {
        panel.classList.toggle("is-active", Boolean(query));
    }

    if (!status) {
        return;
    }

    if (!query) {
        updateStatus(status, defaultStatus);
        return;
    }

    if (!results.length) {
        updateStatus(status, 鏈壘鍒颁笌鈥?鈥濈浉鍏崇殑鍐呭锛岃灏濊瘯鎹釜鍏抽敭璇嶃€俙);
        return;
    }

    updateStatus(status, 鎵惧埌  鏉′笌鈥?鈥濈浉鍏崇殑鍐呭銆俙);

    if (!list) {
        return;
    }

    for (const item of results) {
        const card = document.createElement("article");
        card.className = "search-result";

        const titleLink = document.createElement("a");
        titleLink.className = "search-result__title";
        titleLink.href = item.url;
        titleLink.textContent = item.title;
        titleLink.rel = "noopener";
        card.appendChild(titleLink);

        if (item.excerpt) {
            const excerpt = document.createElement("p");
            excerpt.className = "search-result__excerpt";
            excerpt.textContent = item.excerpt;
            card.appendChild(excerpt);
        }

        const meta = document.createElement("div");
        meta.className = "search-result__meta";

        const tag = document.createElement("span");
        tag.className = "search-result__tag";
        tag.textContent = getLabelForSection(item.section);
        meta.appendChild(tag);

        if (item.matchType === "pinyin") {
            const note = document.createElement("span");
            note.className = "search-result__note";
            note.textContent = "鎷奸煶鍖归厤";
            meta.appendChild(note);
        }

        card.appendChild(meta);
        list.appendChild(card);
    }
};

const initialiseWidget = (widget) => {
    if (!widget || widget.dataset.initialised === "true") return;
    widget.dataset.initialised = "true";

    const input = widget.querySelector('[data-role="search-input"]');
    const contextName = widget.dataset.searchContext || "page";
    const landing = contextName === "home" ? widget.closest(".home-landing") : null;

    const resultsTargetSelector = widget.dataset.resultsTarget;
    let resultsPanel = null;
    let listContainer = null;
    let statusContainer = null;

    if (resultsTargetSelector) {
        resultsPanel = document.querySelector(resultsTargetSelector);
        if (resultsPanel) {
            listContainer =
                resultsPanel.querySelector('[data-role="external-results"]') || resultsPanel;
            statusContainer =
                resultsPanel.querySelector('[data-role="external-status"]') || null;
        }
    }

    if (!listContainer) {
        listContainer = widget.querySelector('[data-role="search-results"]');
    }
    if (!statusContainer) {
        statusContainer = widget.querySelector('[data-role="search-status"]');
    }

    const defaultStatusMessage =
        widget.dataset.defaultStatus || "璇疯緭鍏ラ渶瑕佺殑璧勬簮杩涜鎼滅储銆?";

    if (statusContainer) {
        updateStatus(statusContainer, defaultStatusMessage);
    }

    const renderContext = {
        list: listContainer,
        status: statusContainer,
        panel: resultsPanel,
        defaultStatus: defaultStatusMessage
    };

    const state = {
        latestQuery: "",
        runningToken: 0
    };

    const runSearch = async () => {
        const rawQuery = normaliseQuery(state.latestQuery);
        const query = rawQuery.trim();

        if (landing) {
            const hasText = query.length > 0;
            landing.classList.toggle("has-text", hasText);
            landing.classList.toggle("is-searching", hasText);
        }

        if (!query) {
            renderResults(renderContext, [], "");
            return;
        }

        const token = ++state.runningToken;
        const sections = UNIVERSAL_SCOPE;

        updateStatus(renderContext.status, "姝ｅ湪涓轰綘鏌ユ壘鐩稿叧璧勬簮鈥?");

        const flexResults = await searchFlexIndex(query, sections);
        let filtered = Array.isArray(flexResults) ? flexResults.slice() : [];

        const manifestMatches = await searchManifest(query, sections);
        filtered = mergeByUrl(filtered, manifestMatches);

        if (ASCII_PATTERN.test(query)) {
            const pinyinMatches = await searchByPinyin(query, sections);
            filtered = mergeByUrl(filtered, pinyinMatches);
        } else {
            filtered = filtered.slice(0, RESULT_LIMIT);
        }

        if (state.runningToken !== token) {
            return;
        }

        renderResults(renderContext, filtered, query);
    };

    const debouncedSearch = debounce(runSearch, 240);

    if (input) {
        input.addEventListener("input", (event) => {
            state.latestQuery = event.target.value || "";
            debouncedSearch();
        });
    }
};

const initAll = () => {
    document
        .querySelectorAll('[data-role="search-root"]')
        .forEach((widget) => initialiseWidget(widget));
};

if (!window.NuaaSearch) {
    window.NuaaSearch = {
        initAll
    };
}

if (!window.NuaaSearchReady) {
    window.NuaaSearchReady = Promise.resolve().then(() => {
        document.dispatchEvent(new CustomEvent("nuaasearch:ready"));
    });
}
