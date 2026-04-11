"""
Generate search-ready datasets for the NUAA Guide.

Alongside the legacy search manifest, this command now builds three focused
JSON buckets (subjects, materials, tools) plus a lightweight char
dictionary used by the chat-style search UI.
"""

from __future__ import annotations

import json
import re
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable
from urllib.parse import quote


PROJECT_ROOT = Path(__file__).resolve().parents[1]
CONTENT_ROOT = PROJECT_ROOT / "content"
STATIC_DATA_DIR = PROJECT_ROOT / "static" / "data"

MANIFEST_FILE = STATIC_DATA_DIR / "search-manifest.json"
SUBJECTS_FILE = STATIC_DATA_DIR / "subjects.json"
MATERIALS_FILE = STATIC_DATA_DIR / "materials.json"
TOOLS_FILE = STATIC_DATA_DIR / "tools.json"
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


def compute_features(*parts: str) -> tuple[list[str], list[str]]:
    filtered = "".join(part or "" for part in parts)
    filtered = "".join(ch for ch in filtered if not ch.isspace())
    if not filtered:
        return [], []
    chars = unique_preserve(filtered)
    bigrams = unique_preserve(
        filtered[i : i + 2] for i in range(len(filtered) - 1)
    )
    GLOBAL_CHAR_SET.update(chars)
    return chars, bigrams


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
        item["_chars"] = chars
        item["_bigrams"] = bigrams
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
        item["_chars"] = chars
        item["_bigrams"] = bigrams
        items.append(item)
    items.sort(key=lambda entry: (entry["section"], entry["title"]))
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
        entry["_chars"] = chars
        entry["_bigrams"] = bigrams
        subjects.append(entry)
    subjects.sort(key=lambda item: item["title"])
    return subjects


def write_json(target: Path, payload: object) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
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

    write_json(MANIFEST_FILE, manifest_entries)
    write_json(MATERIALS_FILE, materials_entries)
    write_json(TOOLS_FILE, tools_entries)
    write_json(SUBJECTS_FILE, subjects_entries)
    write_json(
        CHARS_FILE,
        {"chars": "".join(sorted(GLOBAL_CHAR_SET))},
    )

    print(  # noqa: T201
        (
            f"Wrote manifest ({len(manifest_entries)}) + "
            f"subjects ({len(subjects_entries)}), materials ({len(materials_entries)}), "
            f"tools ({len(tools_entries)})"
        )
    )


if __name__ == "__main__":
    main()
