(function () {
    const normalize = (value) => (value || "").toString().trim().toLowerCase();
    const collator = new Intl.Collator("zh-Hans-u-co-pinyin", {
        sensitivity: "base",
        numeric: true,
    });
    const anchorStr = "\u963f\u516b\u56d2\u54d2\u59b8\u53d1\u65ae\u54c8\u8ba5\u5494\u5783\u5988\u62ff\u54e6\u556a\u671f\u7136\u6492\u584c\u6316\u6614\u538b\u531d";
    const anchorLetters = "ABCDEFGHJKLMNOPQRSTWXYZ";

    const toLetter = (input) => {
        if (!input) {
            return "#";
        }
        const match = /^[A-Za-z]/.exec(input);
        return match ? match[0].toUpperCase() : "#";
    };

    const getInitialByAnchors = (name) => {
        const s = (name || "").trim();
        if (!s) {
            return "#";
        }
        const ch = s[0];
        if (collator.compare(ch, anchorStr[0]) < 0) {
            return anchorLetters[0] || "A";
        }
        for (let i = 0; i < anchorStr.length; i += 1) {
            if (collator.compare(ch, anchorStr[i]) < 0) {
                return anchorLetters[Math.max(0, i - 1)] || "Z";
            }
        }
        return "Z";
    };

    const getInitialLetter = (name) => {
        const trimmed = (name || "").trim();
        if (!trimmed) {
            return "#";
        }

        const fallbackChar = trimmed[0];
        if (/[A-Za-z]/.test(fallbackChar)) {
            return fallbackChar.toUpperCase();
        }

        return getInitialByAnchors(trimmed);
    };

    const buildSubjectDirectory = (directoryRoot) => {
        if (!directoryRoot || directoryRoot.dataset.prepared === "true") {
            return null;
        }

        const chips = Array.from(
            directoryRoot.querySelectorAll('[data-role="subject-chip"]')
        );
        if (chips.length === 0) {
            return null;
        }

        const entries = chips.map((chip) => {
            const name = chip.dataset.subjectName || chip.textContent.trim();
            chip.dataset.subjectName = name;
            chip.dataset.subject = chip.dataset.subject || name;
            return {
                chip,
                name,
                subject: chip.dataset.subject,
                initial: (chip.dataset.initial || "").trim().toUpperCase() || getInitialLetter(name),
            };
        });

        entries.sort((a, b) => {
            const letterA = a.initial || "#";
            const letterB = b.initial || "#";
            if (letterA === letterB) {
                return collator.compare(a.name, b.name);
            }
            if (letterA === "#") {
                return 1;
            }
            if (letterB === "#") {
                return -1;
            }
            return letterA.localeCompare(letterB, "en-US");
        });

        directoryRoot.innerHTML = "";
        let currentLetter = null;
        let currentItems = null;

        entries.forEach((entry) => {
            if (entry.initial !== currentLetter) {
                currentLetter = entry.initial;
                const group = document.createElement("div");
                group.className = "subject-group";

                const letterNode = document.createElement("div");
                letterNode.className = "subject-letter";
                letterNode.textContent = currentLetter;

                currentItems = document.createElement("div");
                currentItems.className = "subject-items";

                group.append(letterNode, currentItems);
                directoryRoot.appendChild(group);
            }

            entry.chip.classList.remove("is-active");
            if (currentItems) {
                currentItems.appendChild(entry.chip);
            }
        });

        directoryRoot.dataset.prepared = "true";
        if (typeof window !== "undefined") {
            const detail = { detail: { count: entries.length } };
            directoryRoot.dispatchEvent(new CustomEvent("subjectDirectoryUpdated", detail));
        }
        return entries;
    };

    function initMaterialsPage() {
        const container = document.querySelector(".materials-page");
        if (!container || container.dataset.enhanced === "true") {
            return;
        }

        const searchInput = container.querySelector('[data-role="materials-search"]');
        const subjectList = container.querySelector('[data-role="subject-list"]');
        const directoryRoot = container.querySelector('[data-role="subject-directory"]');
        const cards = Array.from(container.querySelectorAll(".material-card"));
        const countElement = container.querySelector("[data-material-count]");
        const emptyState = container.querySelector('[data-role="materials-empty"]');
        const resetLink = container.querySelector('[data-role="materials-reset"]');

        let activeSubject = "all";
        let activeSubjectNormalized = "all";

        const collectSubjectChips = () =>
            Array.from(container.querySelectorAll('[data-role="subject-chip"]'));

        const ensureActiveHighlight = () => {
            const chips = collectSubjectChips();
            chips.forEach((chip) => {
                const value = chip.dataset.subject || "all";
                chip.classList.toggle("is-active", value === activeSubject);
            });
        };

        const getCardSubjects = (card) =>
            (card.dataset.subjects || "")
                .split("|")
                .map(normalize)
                .filter(Boolean);

        const getCardTags = (card) =>
            (card.dataset.tags || "")
                .split("|")
                .map(normalize)
                .filter(Boolean);

        const updateUI = () => {
            const rawQuery = searchInput ? searchInput.value.trim() : "";
            const query = normalize(rawQuery);
            let visibleCount = 0;

            cards.forEach((card) => {
                const title = normalize(card.dataset.title);
                const subjects = getCardSubjects(card);
                const tags = getCardTags(card);

                const matchesSubject =
                    activeSubject === "all" || subjects.includes(activeSubjectNormalized);

                const matchesQuery =
                    !query ||
                    title.includes(query) ||
                    subjects.some((subject) => subject.includes(query)) ||
                    tags.some((tag) => tag.includes(query));

                if (matchesSubject && matchesQuery) {
                    card.style.display = "";
                    visibleCount += 1;
                } else {
                    card.style.display = "none";
                }
            });

            if (countElement) {
                countElement.textContent = visibleCount;
            }

            if (emptyState) {
                emptyState.hidden = visibleCount !== 0;
            }

            if (resetLink) {
                const shouldShowReset = activeSubject !== "all" || rawQuery.length > 0;
                resetLink.hidden = !shouldShowReset;
            }
        };

        const setActiveSubject = (value) => {
            activeSubject = value || "all";
            activeSubjectNormalized = normalize(activeSubject);
            ensureActiveHighlight();
            updateUI();
        };

        buildSubjectDirectory(directoryRoot);
        ensureActiveHighlight();
        if (directoryRoot) {
            directoryRoot.addEventListener("subjectDirectoryUpdated", () => {
                setActiveSubject(activeSubject);
            });
        }

        if (searchInput) {
            searchInput.addEventListener("input", () => {
                updateUI();
            });
        }

        if (subjectList) {
            subjectList.addEventListener("click", (event) => {
                const chip = event.target.closest('[data-role="subject-chip"]');
                if (!chip || !subjectList.contains(chip)) {
                    return;
                }
                if (chip.tagName === "A" && chip.hasAttribute("href")) {
                    return;
                }
                const subjectValue = chip.dataset.subject || "all";
                if (subjectValue === activeSubject) {
                    return;
                }
                setActiveSubject(subjectValue);
            });
        }

        if (resetLink) {
            resetLink.addEventListener("click", (event) => {
                event.preventDefault();
                if (searchInput) {
                    searchInput.value = "";
                }
                setActiveSubject("all");
            });
        }

        container.dataset.enhanced = "true";
        setActiveSubject("all");
    }

    window.initMaterialsPage = initMaterialsPage;

    const initLooseDirectories = () => {
        const directories = document.querySelectorAll(
            '[data-role="subject-directory"]:not([data-prepared="true"])'
        );
        directories.forEach((directory) => {
            if (directory.closest(".materials-page")) {
                return;
            }
            buildSubjectDirectory(directory);
        });
    };

    window.initLooseDirectories = initLooseDirectories;

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
            initMaterialsPage();
            initLooseDirectories();
        });
    } else {
        initMaterialsPage();
        initLooseDirectories();
    }
})();
