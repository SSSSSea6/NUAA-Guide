(function () {
    const normalize = (value) => (value || "").toString().trim().toLowerCase();
    const collator = new Intl.Collator("zh-Hans-u-co-pinyin", {
        sensitivity: "accent",
        numeric: true,
    });

    const toLetter = (input) => {
        if (!input) {
            return "#";
        }
        const letter = input.charAt(0).toUpperCase();
        return /[A-Z]/.test(letter) ? letter : "#";
    };

    const getInitialLetter = (name) => {
        const trimmed = (name || "").trim();
        if (!trimmed) {
            return "#";
        }

        if (window.pinyinPro && typeof window.pinyinPro.pinyin === "function") {
            try {
                const result = window.pinyinPro.pinyin(trimmed, {
                    pattern: "first",
                    toneType: "none",
                    multiple: false,
                });
                if (Array.isArray(result) && result[0]) {
                    return toLetter(result[0]);
                }
                if (typeof result === "string" && result.length > 0) {
                    return toLetter(result);
                }
            } catch (error) {
                console.warn("[materials] pinyin conversion failed:", error);
            }
        }

        const fallbackChar = trimmed[0];
        if (/[A-Za-z]/.test(fallbackChar)) {
            return fallbackChar.toUpperCase();
        }
        return "#";
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
                initial: getInitialLetter(name),
            };
        });

        entries.sort((a, b) => collator.compare(a.name, b.name));

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
            currentItems.appendChild(entry.chip);
        });

        directoryRoot.dataset.prepared = "true";
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
            const query = normalize(searchInput ? searchInput.value : "");
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
                const shouldShowReset = activeSubject !== "all" || query.length > 0;
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
