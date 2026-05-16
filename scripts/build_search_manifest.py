"""
Generate search-ready datasets for the NUAA Guide.

Alongside the legacy search manifest, this command now builds three focused
JSON buckets (subjects, materials, tools) plus a lightweight char
dictionary used by the chat-style search UI.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable
from urllib.parse import quote

try:
    from pypinyin import lazy_pinyin
except ImportError:  # pragma: no cover - CI installs pypinyin, fallback keeps local checks usable.
    lazy_pinyin = None


PROJECT_ROOT = Path(__file__).resolve().parents[1]
CONTENT_ROOT = PROJECT_ROOT / "content"
STATIC_DATA_DIR = PROJECT_ROOT / "static" / "data"

MANIFEST_FILE = STATIC_DATA_DIR / "search-manifest.json"
SUBJECTS_FILE = STATIC_DATA_DIR / "subjects.json"
MATERIALS_FILE = STATIC_DATA_DIR / "materials.json"
MATERIALS_SEARCH_FILE = STATIC_DATA_DIR / "materials-search.json"
TOOLS_FILE = STATIC_DATA_DIR / "tools.json"
TOOLS_SEARCH_FILE = STATIC_DATA_DIR / "tools-search.json"
CHARS_FILE = STATIC_DATA_DIR / "chars.json"

FRONT_MATTER_REGEX = re.compile(r"^---\s*\n(.*?)\n---\s*\n?", re.S)
MARKDOWN_CLEANUP_RULES = [
    (re.compile(r"```.*?```", re.S), " "),  # fenced code blocks
    (re.compile(r"`([^`]+)`"), r"\1"),  # inline code
    (re.compile(r"!\[[^\]]*\]\([^)]+\)"), " "),  # images
    (re.compile(r"\[([^\]]+)\]\([^)]+\)"), r"\1"),  # links
    (re.compile(r"<[^>]+>"), " "),  # HTML tags
    (re.compile(r"^#+\s*", re.M), ""),  # headings
    (re.compile(r">+\s*", re.M), ""),  # blockquotes
    (re.compile(r"[*_~`]+"), ""),  # emphasis markers
]

SKIP_SECTIONS = {"search"}
TEXT_LIMIT = 160

GLOBAL_CHAR_SET: set[str] = set()


@dataclass
class MarkdownDoc:
    path: Path
    metadata: dict[str, object]
    body: str
    plain_text: str
    summary: str

    @property
    def relative_parts(self) -> tuple[str, ...]:
        return self.path.relative_to(CONTENT_ROOT).with_suffix("").parts

    @property
    def section(self) -> str:
        parts = self.relative_parts
        return parts[0] if parts else "other"

    @property
    def url(self) -> str:
        parts = self.relative_parts
        slug = "/".join(parts)
        return f"/{slug}/"


def parse_front_matter_block(raw: str) -> dict[str, object]:
    if not raw:
        return {}
    front_matter: dict[str, object] = {}
    for raw_line in raw.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or ":" not in line:
            continue
        key, value = line.split(":", 1)
        key = key.strip()
        value = value.strip()
        if not key:
            continue
        if value.startswith(('"', "'")) and value.endswith(('"', "'")):
            front_matter[key] = value[1:-1]
        elif value.startswith("[") and value.endswith("]"):
            items = [
                item.strip().strip('"').strip("'")
                for item in value[1:-1].split(",")
                if item.strip()
            ]
            front_matter[key] = items
        elif value.lower() in {"true", "false"}:
            front_matter[key] = value.lower() == "true"
        else:
            front_matter[key] = value
    return front_matter


def clean_markdown(value: str) -> str:
    text = value
    for pattern, replacement in MARKDOWN_CLEANUP_RULES:
        text = pattern.sub(replacement, text)
    return re.sub(r"\s+", " ", text).strip()


def slice_text(value: str, limit: int = TEXT_LIMIT) -> str:
    return value[:limit].strip()


def ensure_list(value: object) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    text = str(value).strip()
    if not text:
        return []
    if text.startswith("[") and text.endswith("]"):
        inner = text[1:-1]
        return [
            item.strip().strip('"').strip("'")
            for item in inner.split(",")
            if item.strip()
        ]
    return [part.strip() for part in text.split(",") if part.strip()]


def normalise_date(value: object) -> str | None:
    if not value:
        return None
    text = str(value).strip()
    if not text:
        return None
    norm = text.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(norm)
    except ValueError:
        return text
    return parsed.isoformat()


def unique_preserve(values: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for item in values:
        if item not in seen:
            seen.add(item)
            ordered.append(item)
    return ordered


def compute_features(*parts: str) -> tuple[str, list[str]]:
    filtered = "".join(part or "" for part in parts)
    filtered = "".join(ch for ch in filtered if not ch.isspace())
    if not filtered:
        return "", []
    chars = unique_preserve(filtered)
    bigrams = unique_preserve(
        filtered[i : i + 2] for i in range(len(filtered) - 1)
    )
    GLOBAL_CHAR_SET.update(chars)
    return "".join(chars), bigrams


def compute_pinyin_features(*parts: str) -> tuple[str, str]:
    text = "".join(part or "" for part in parts)
    if not text or lazy_pinyin is None:
        return "", ""

    syllables = [item for item in lazy_pinyin(text, errors="ignore") if item]
    if not syllables:
        return "", ""

    full = "".join(syllables).lower()
    initials = "".join(syllable[0] for syllable in syllables if syllable).lower()
    return full, initials


def parse_markdown(path: Path) -> MarkdownDoc | None:
    rel_parts = path.relative_to(CONTENT_ROOT).with_suffix("").parts
    if not rel_parts or rel_parts[-1] == "_index":
        return None
    section = rel_parts[0]
    if section in SKIP_SECTIONS:
        return None

    raw = path.read_text(encoding="utf-8")
    meta_match = FRONT_MATTER_REGEX.match(raw)
    metadata: dict[str, object] = {}
    body = raw
    if meta_match:
        metadata = parse_front_matter_block(meta_match.group(1))
        body = raw[meta_match.end() :]
    plain_text = clean_markdown(body)
    summary = str(metadata.get("summary") or slice_text(plain_text))
    return MarkdownDoc(
        path=path,
        metadata=metadata,
        body=body,
        plain_text=plain_text,
        summary=summary,
    )


def build_manifest(docs: Iterable[MarkdownDoc]) -> list[dict[str, object]]:
    entries: list[dict[str, object]] = []
    for doc in docs:
        tags = ensure_list(doc.metadata.get("tags"))
        entries.append(
            {
                "title": str(doc.metadata.get("title") or doc.relative_parts[-1]),
                "summary": doc.summary,
                "section": doc.section,
                "url": doc.url,
                "tags": tags,
            }
        )
    entries.sort(key=lambda item: (item["section"], item["title"]))
    return entries


def build_materials(docs: Iterable[MarkdownDoc]) -> list[dict[str, object]]:
    items: list[dict[str, object]] = []
    for doc in docs:
        subjects = ensure_list(doc.metadata.get("subjects"))
        tags = ensure_list(doc.metadata.get("tags"))
        item: dict[str, object] = {
            "type": "material",
            "title": str(doc.metadata.get("title") or doc.relative_parts[-1]),
            "url": doc.url,
            "subjects": subjects,
            "tags": tags,
            "summary": doc.summary,
            "date": normalise_date(doc.metadata.get("date")),
        }
        for extra_key in ("file_url", "file_type"):
            if doc.metadata.get(extra_key):
                item[extra_key] = str(doc.metadata[extra_key])
        chars, bigrams = compute_features(
            item["title"],
            "".join(subjects),
            "".join(tags),
            doc.summary,
            doc.plain_text,
        )
        pinyin, initials = compute_pinyin_features(
            item["title"],
            "".join(subjects),
            "".join(tags),
        )
        item["_chars"] = chars
        item["_bigrams"] = bigrams
        item["_p"] = pinyin
        item["_i"] = initials
        items.append(item)
    items.sort(key=lambda entry: entry["title"])
    return items


def build_tools(docs: Iterable[MarkdownDoc]) -> list[dict[str, object]]:
    items: list[dict[str, object]] = []
    for doc in docs:
        item = {
            "type": "tool",
            "title": str(doc.metadata.get("title") or doc.relative_parts[-1]),
            "url": doc.url,
            "section": doc.section,
            "excerpt": doc.summary,
            "fulltext": doc.plain_text,
        }
        chars, bigrams = compute_features(
            item["title"],
            doc.section,
            doc.summary,
            doc.plain_text,
        )
        pinyin, initials = compute_pinyin_features(
            item["title"],
            doc.section,
            doc.summary,
        )
        item["_chars"] = chars
        item["_bigrams"] = bigrams
        item["_p"] = pinyin
        item["_i"] = initials
        items.append(item)
    items.sort(key=lambda entry: (entry["section"], entry["title"]))
    return items


def build_material_search_index(
    materials: Iterable[dict[str, object]],
) -> list[dict[str, object]]:
    items: list[dict[str, object]] = []
    for material in materials:
        item: dict[str, object] = {
            "type": material["type"],
            "title": material["title"],
            "url": material["url"],
            "subjects": material["subjects"],
            "tags": material["tags"],
            "_chars": material["_chars"],
            "_bigrams": material["_bigrams"],
            "_p": material["_p"],
            "_i": material["_i"],
        }
        if material.get("date"):
            item["date"] = material["date"]
        if material.get("file_url"):
            item["file_url"] = material["file_url"]
        if material.get("file_type"):
            item["file_type"] = material["file_type"]
        items.append(item)
    return items


def build_tools_search_index(
    tools: Iterable[dict[str, object]],
) -> list[dict[str, object]]:
    items: list[dict[str, object]] = []
    for tool in tools:
        items.append(
            {
                "type": tool["type"],
                "title": tool["title"],
                "url": tool["url"],
                "section": tool["section"],
                "_chars": tool["_chars"],
                "_bigrams": tool["_bigrams"],
                "_p": tool["_p"],
                "_i": tool["_i"],
            }
        )
    return items


def build_subjects(materials: Iterable[dict[str, object]]) -> list[dict[str, object]]:
    subject_map: dict[str, dict[str, object]] = {}
    for material in materials:
        for subject in material.get("subjects", []):
            title = subject.strip()
            if not title:
                continue
            entry = subject_map.setdefault(
                title,
                {
                    "type": "subject",
                    "title": title,
                    "url": f"/subjects/{quote(title, safe='')}/",
                    "count": 0,
                },
            )
            entry["count"] += 1
    subjects: list[dict[str, object]] = []
    for entry in subject_map.values():
        chars, bigrams = compute_features(entry["title"])
        pinyin, initials = compute_pinyin_features(entry["title"])
        entry["_chars"] = chars
        entry["_bigrams"] = bigrams
        entry["_p"] = pinyin
        entry["_i"] = initials
        entry["initial"] = initials[:1].upper() if initials else ""
        subjects.append(entry)
    subjects.sort(key=lambda item: item["title"])
    return subjects


def write_json(target: Path, payload: object, *, compact: bool = False) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    if compact:
        text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    else:
        text = json.dumps(payload, ensure_ascii=False, indent=2)
    target.write_text(text, encoding="utf-8")


def build_all_payloads() -> dict[Path, object]:
    docs: list[MarkdownDoc] = []
    for path in CONTENT_ROOT.rglob("*.md"):
        parsed = parse_markdown(path)
        if parsed:
            docs.append(parsed)

    manifest_entries = build_manifest(docs)

    docs_by_section: dict[str, list[MarkdownDoc]] = defaultdict(list)
    for doc in docs:
        docs_by_section[doc.section].append(doc)

    materials_entries = build_materials(docs_by_section.get("materials", []))
    tool_docs = [
        doc
        for doc in docs
        if doc.section not in {"materials", "subjects"}
    ]
    tools_entries = build_tools(tool_docs)
    subjects_entries = build_subjects(materials_entries)
    materials_search_entries = build_material_search_index(materials_entries)
    tools_search_entries = build_tools_search_index(tools_entries)

    return {
        MANIFEST_FILE: manifest_entries,
        MATERIALS_FILE: materials_entries,
        MATERIALS_SEARCH_FILE: materials_search_entries,
        TOOLS_FILE: tools_entries,
        TOOLS_SEARCH_FILE: tools_search_entries,
        SUBJECTS_FILE: subjects_entries,
        CHARS_FILE: {"chars": "".join(sorted(GLOBAL_CHAR_SET))},
    }


def load_json(path: Path) -> object | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
    except json.JSONDecodeError as exc:
        print(f"[search-data] invalid JSON in {path.relative_to(PROJECT_ROOT)}: {exc}")
        return None


def write_outputs(payloads: dict[Path, object]) -> None:
    compact_targets = {MATERIALS_SEARCH_FILE, TOOLS_SEARCH_FILE, CHARS_FILE}
    for path, payload in payloads.items():
        write_json(path, payload, compact=path in compact_targets)


def check_outputs(payloads: dict[Path, object]) -> bool:
    failures: list[str] = []
    for path, expected in payloads.items():
        current = load_json(path)
        if current is None:
            failures.append(f"missing or unreadable: {path.relative_to(PROJECT_ROOT)}")
            continue
        if current != expected:
            failures.append(f"out of date: {path.relative_to(PROJECT_ROOT)}")

    if failures:
        print("[search-data] generated data is not in sync with the repository:")
        for failure in failures:
            print(f"  - {failure}")
        return False

    print("[search-data] data files are up to date.")
    return True


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate or verify search datasets.")
    parser.add_argument(
        "--check",
        action="store_true",
        help="Verify that the generated datasets match the committed JSON files without writing.",
    )
    args = parser.parse_args(argv)

    payloads = build_all_payloads()
    if args.check:
        return 0 if check_outputs(payloads) else 1

    write_outputs(payloads)
    print(
        f"[search-data] wrote manifest ({len(payloads[MANIFEST_FILE])}) + "
        f"subjects ({len(payloads[SUBJECTS_FILE])}), materials ({len(payloads[MATERIALS_FILE])}), "
        f"materials-search ({len(payloads[MATERIALS_SEARCH_FILE])}), "
        f"tools ({len(payloads[TOOLS_FILE])}), tools-search ({len(payloads[TOOLS_SEARCH_FILE])})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
