"""
Generate a lightweight JSON manifest of site content for the enhanced search widget.

Collects title, summary, tags, section, and URL for Markdown content so that the
client can perform additional fuzzy and pinyin-aware matching.
"""

from __future__ import annotations

import json
import re
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
CONTENT_ROOT = PROJECT_ROOT / "content"
OUTPUT_FILE = PROJECT_ROOT / "static" / "data" / "search-manifest.json"

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


def parse_front_matter(content: str) -> dict[str, object]:
    match = FRONT_MATTER_REGEX.match(content)
    if not match:
        return {}

    front_matter = {}
    for raw_line in match.group(1).splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or ":" not in line:
            continue
        key, value = line.split(":", 1)
        key = key.strip()
        value = value.strip()
        if value.startswith(('"', "'")) and value.endswith(('"', "'")):
            value = value[1:-1]
        elif value.startswith("[") and value.endswith("]"):
            items = [
                item.strip().strip('"').strip("'")
                for item in value[1:-1].split(",")
                if item.strip()
            ]
            value = items
        front_matter[key] = value
    return front_matter


def slice_plain_text(content: str, *, limit: int = 140) -> str:
    text = content
    for pattern, replacement in MARKDOWN_CLEANUP_RULES:
        text = pattern.sub(replacement, text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:limit].strip()


def build_entry(path: Path) -> dict[str, object] | None:
    raw = path.read_text(encoding="utf-8")
    metadata = parse_front_matter(raw)
    body_start = FRONT_MATTER_REGEX.match(raw)
    body = raw[body_start.end() :] if body_start else raw

    rel_parts = path.relative_to(CONTENT_ROOT).with_suffix("").parts
    if not rel_parts:
        return None

    # Skip section index files
    if rel_parts[-1] == "_index":
        return None

    section = rel_parts[0]
    slug = "/".join(rel_parts)
    url = f"/{slug}/"

    title = str(metadata.get("title") or rel_parts[-1])
    summary = str(metadata.get("summary") or slice_plain_text(body))
    tags = metadata.get("tags")
    if isinstance(tags, str):
        tags = [tag.strip() for tag in tags.split(",") if tag.strip()]

    return {
        "title": title,
        "summary": summary,
        "section": section,
        "url": url,
        "tags": tags or [],
    }


def main() -> None:
    entries: list[dict[str, object]] = []
    for path in CONTENT_ROOT.rglob("*.md"):
        if path.name == "search.md":
            continue
        entry = build_entry(path)
        if entry:
            entries.append(entry)

    entries.sort(key=lambda item: (item["section"], item["title"]))

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(
        json.dumps(entries, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Search manifest written to {OUTPUT_FILE} ({len(entries)} entries)")  # noqa: T201


if __name__ == "__main__":
    main()
