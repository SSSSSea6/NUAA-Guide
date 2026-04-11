const DATA_ENDPOINTS = {
    subjects: "/data/subjects.json",
    materials: "/data/materials.json",
    tools: "/data/tools.json",
    chars: "/data/chars.json"
};

const BUCKET_KEYS = ["subjects", "materials", "tools"];
const ASCII_PATTERN = /^[\x00-\x7F]+$/;
const COMMON_CHAR_MIN_HITS = 60; // guard against extremely common single-character hits (e.g. U+6570 / U+5B66)
const COMMON_CHAR_RATIO = 0.1;

const bucketCache = {
    subjects: null,
    materials: null,
    tools: null
};
const bucketPromises = {};
const bucketCharFrequency = {};

let charDictPromise = null;
let charDictSet = null;

const pinyinCache = new Map();

const fetchJson = async (url) => {
    try {
        const response = await fetch(url, { credentials: "same-origin" });
        if (!response.ok) {
            return null;
        }
        return await response.json();
    } catch (error) {
        console.error("[search] failed to fetch", url, error);
        return null;
    }
};

const inferType = (bucket) => {
    switch (bucket) {
        case "subjects":
            return "subject";
        case "materials":
            return "material";
        case "tools":
            return "tool";
        default:
            return bucket;
    }
};

const hydrateEntry = (entry, bucket) => {
    const clone = { ...entry };
    clone.type = clone.type || inferType(bucket);
    const chars = Array.isArray(clone._chars) ? clone._chars : [];
    const bigrams = Array.isArray(clone._bigrams) ? clone._bigrams : [];
    clone._charSet = new Set(chars);
    clone._bigramSet = new Set(bigrams);
    return clone;
};

const hydrateBucket = (entries, bucket) => {
    if (!Array.isArray(entries) || entries.length === 0) {
        return [];
    }
    return entries.map((entry) => hydrateEntry(entry, bucket));
};

const ensureBucket = (bucket) => {
    if (bucketCache[bucket]) {
        return Promise.resolve(bucketCache[bucket]);
    }
    if (!bucketPromises[bucket]) {
        bucketPromises[bucket] = fetchJson(DATA_ENDPOINTS[bucket]).then((data) => {
            bucketCache[bucket] = hydrateBucket(data || [], bucket);
            return bucketCache[bucket];
        });
    }
    return bucketPromises[bucket];
};

const ensureBuckets = (buckets) => Promise.all(buckets.map((bucket) => ensureBucket(bucket)));

const ensureCharDict = () => {
    if (charDictSet) {
        return Promise.resolve(charDictSet);
    }
    if (!charDictPromise) {
        charDictPromise = fetchJson(DATA_ENDPOINTS.chars).then((payload) => {
            const chars = typeof payload?.chars === "string" ? payload.chars : "";
            charDictSet = new Set(Array.from(chars));
            return charDictSet;
        });
    }
    return charDictPromise;
};

const idleFetchBuckets = () => {
    const lazyKeys = ["materials", "tools"];
    const idle = window.requestIdleCallback
        ? window.requestIdleCallback
        : (cb) => setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 16 }), 350);
    idle(() => lazyKeys.forEach((bucket) => ensureBucket(bucket)));
};

ensureBucket("subjects");
ensureCharDict();
if (typeof window !== "undefined") {
    idleFetchBuckets();
}

const cleanQuery = (query, dict) => {
    const dictionary = dict || charDictSet || new Set();
    return Array.from(query || "")
        .filter((char) => dictionary.has(char))
        .join("");
};

const buildBigrams = (value) => {
    const chars = Array.from(value || "");
    const pairs = new Set();
    for (let index = 0; index < chars.length - 1; index += 1) {
        pairs.add(chars[index] + chars[index + 1]);
    }
    return pairs;
};

const longestCommonSubstring = (left, right) => {
    if (!left || !right) {
        return 0;
    }
    const a = Array.from(left);
    const b = Array.from(right);
    let max = 0;
    let prev = new Array(b.length + 1).fill(0);
    let curr = new Array(b.length + 1).fill(0);

    for (let i = 1; i <= a.length; i += 1) {
        for (let j = 1; j <= b.length; j += 1) {
            if (a[i - 1] === b[j - 1]) {
                curr[j] = prev[j - 1] + 1;
                if (curr[j] > max) {
                    max = curr[j];
                }
            } else {
                curr[j] = 0;
            }
        }
        const temp = prev;
        prev = curr;
        curr = temp;
        curr.fill(0);
    }
    return max;
};

const recencyBoost = (iso) => {
    if (!iso) return 0;
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) {
        return 0;
    }
    const days = (Date.now() - parsed.getTime()) / 86400000;
    if (days <= 30) return 6;
    if (days <= 90) return 4;
    if (days <= 180) return 2;
    if (days <= 365) return 1;
    return 0;
};

const scoreItem = (item, cleanedQuery) => {
    if (!cleanedQuery) {
        return 0;
    }
    const qChars = new Set(Array.from(cleanedQuery));
    const qBigrams = buildBigrams(cleanedQuery);
    const tags = Array.isArray(item.tags) ? item.tags.join("") : "";
    const subjects = Array.isArray(item.subjects) ? item.subjects.join("") : "";
    const baseText = `${item.title || ""}${tags}${subjects}`;
    const lcsLen = longestCommonSubstring(baseText, cleanedQuery);

    let score = 3 * lcsLen;
    qBigrams.forEach((pair) => {
        if (item._bigramSet?.has(pair)) {
            score += 2;
        }
    });
    qChars.forEach((char) => {
        if (item._charSet?.has(char)) {
            score += 1;
        }
    });

    if (item.type === "subject" && item.title === cleanedQuery) {
        score += 8;
    }
    if (item.date) {
        score += recencyBoost(item.date);
    }
    return score;
};

const rankBucket = (entries, cleanedQuery) => {
    if (!cleanedQuery || !Array.isArray(entries)) {
        return [];
    }
    const scored = [];
    for (const entry of entries) {
        const score = scoreItem(entry, cleanedQuery);
        if (score > 0) {
            scored.push({ ...entry, _score: score, matchType: "char" });
        }
    }
    scored.sort((a, b) => (b._score || 0) - (a._score || 0));
    return scored;
};

const mergeResults = (primary, fallback) => {
    if (!fallback || fallback.length === 0) {
        return primary;
    }
    const merged = [];
    const seen = new Set();
    for (const item of primary) {
        merged.push(item);
        if (item.url) {
            seen.add(item.url);
        }
    }
    for (const item of fallback) {
        if (item.url && seen.has(item.url)) {
            continue;
        }
        merged.push(item);
        if (item.url) {
            seen.add(item.url);
        }
    }
    merged.sort((a, b) => (b._score || 0) - (a._score || 0));
    return merged;
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

const getPinyinVariants = async (text) => {
    if (!text) {
        return null;
    }
    if (pinyinCache.has(text)) {
        return pinyinCache.get(text);
    }
    const lib = await loadPinyin();
    if (!lib) {
        return null;
    }
    try {
        const syllables = lib
            .pinyin(text, { toneType: "none", type: "array" })
            .filter(Boolean);
        const full = syllables.join("").toLowerCase();
        const initials = syllables
            .map((syllable) => (syllable ? syllable[0] : ""))
            .join("")
            .toLowerCase();
        const variants = { full, initials };
        pinyinCache.set(text, variants);
        return variants;
    } catch (error) {
        console.warn("[search] pinyin conversion failed:", error);
        return null;
    }
};

const matchBucketByPinyin = async (query, entries, taken) => {
    if (!ASCII_PATTERN.test(query) || !Array.isArray(entries) || !entries.length) {
        return [];
    }
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
        return [];
    }
    const seen = taken || new Set();
    const results = [];
    for (const entry of entries) {
        if (entry.url && seen.has(entry.url)) {
            continue;
        }
        const variants = await getPinyinVariants(entry.title || "");
        if (!variants) {
            continue;
        }
        if (variants.full.includes(normalized) || variants.initials.includes(normalized)) {
            const boost = Math.min(normalized.length * 0.5, 4);
            results.push({
                ...entry,
                _score: boost,
                matchType: "pinyin"
            });
            if (entry.url) {
                seen.add(entry.url);
            }
        }
    }
    results.sort((a, b) => (b._score || 0) - (a._score || 0));
    return results;
};

const ensureBucketCharFrequency = (bucket) => {
    if (bucketCharFrequency[bucket]) {
        return bucketCharFrequency[bucket];
    }
    const freq = new Map();
    const entries = bucketCache[bucket] || [];
    entries.forEach((entry) => {
        const chars = Array.isArray(entry._chars) ? entry._chars : [];
        chars.forEach((char) => {
            freq.set(char, (freq.get(char) || 0) + 1);
        });
    });
    bucketCharFrequency[bucket] = freq;
    return freq;
};

const totalEntriesForBuckets = (buckets) =>
    buckets.reduce((sum, bucket) => {
        const entries = bucketCache[bucket];
        return sum + (Array.isArray(entries) ? entries.length : 0);
    }, 0);

const getCharHitCount = (char, buckets) => {
    if (!char) {
        return 0;
    }
    return buckets.reduce((sum, bucket) => {
        const freq = ensureBucketCharFrequency(bucket);
        return sum + (freq.get(char) || 0);
    }, 0);
};

const isCommonSingleCharQuery = (char, buckets) => {
    if (!char || char.length !== 1) {
        return false;
    }
    const hits = getCharHitCount(char, buckets);
    if (!hits) {
        return false;
    }
    const total = Math.max(1, totalEntriesForBuckets(buckets));
    const ratio = hits / total;
    return hits >= COMMON_CHAR_MIN_HITS && ratio >= COMMON_CHAR_RATIO;
};

const loadBuckets = async (options = {}) => {
    const bucketFilter = Array.isArray(options.buckets) && options.buckets.length ? options.buckets : BUCKET_KEYS;
    await Promise.all([ensureCharDict(), ensureBuckets(bucketFilter)]);
    const payload = { charDict: charDictSet };
    bucketFilter.forEach((bucket) => {
        payload[bucket] = bucketCache[bucket] || [];
    });
    return payload;
};

const runSearch = async (query, scopes = {}) => {
    const rawQuery = (query || "").trim();
    const bucketsToSearch =
        Array.isArray(scopes.buckets) && scopes.buckets.length ? scopes.buckets : BUCKET_KEYS;

    const [dict] = await Promise.all([ensureCharDict(), ensureBuckets(bucketsToSearch)]);
    const cleaned = cleanQuery(rawQuery, dict);
    const result = {
        subjects: [],
        materials: [],
        tools: []
    };
    if (!cleaned) {
        return result;
    }
    if (isCommonSingleCharQuery(cleaned, bucketsToSearch)) {
        return result;
    }

    const takenByBucket = {};
    for (const bucket of bucketsToSearch) {
        const ranked = rankBucket(bucketCache[bucket] || [], cleaned);
        result[bucket] = ranked;
        takenByBucket[bucket] = new Set(ranked.map((entry) => entry.url));
    }

    if (ASCII_PATTERN.test(rawQuery) && rawQuery) {
        for (const bucket of bucketsToSearch) {
            const fallback = await matchBucketByPinyin(
                rawQuery,
                bucketCache[bucket] || [],
                takenByBucket[bucket]
            );
            if (fallback.length) {
                result[bucket] = mergeResults(result[bucket], fallback);
            }
        }
    }
    return result;
};

const initAll = () => {
    // Legacy hook retained for backwards compatibility with older widgets.
};

if (!window.NuaaSearch) {
    window.NuaaSearch = {
        loadBuckets,
        runSearch,
        cleanQuery,
        initAll
    };
} else {
    window.NuaaSearch.loadBuckets = loadBuckets;
    window.NuaaSearch.runSearch = runSearch;
    window.NuaaSearch.cleanQuery = cleanQuery;
    window.NuaaSearch.initAll = initAll;
}

if (!window.NuaaSearchReady) {
    window.NuaaSearchReady = Promise.resolve().then(() => {
        document.dispatchEvent(new CustomEvent("nuaasearch:ready"));
    });
}
