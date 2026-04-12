#!/usr/bin/env python3
"""
Validate the generated Markdown files under content/materials.
"""

from __future__ import annotations

from pathlib import Path

import yaml


REQUIRED_FIELDS = ("title", "tags", "file_url")


def iter_material_files(materials_dir: Path) -> list[Path]:
    return sorted(
        path
        for path in materials_dir.glob("*.md")
        if path.name != "_index.md"
    )


def validate_markdown_file(file_path: Path) -> bool:
    print(f"Validating: {file_path.name}")

    try:
        content = file_path.read_text(encoding="utf-8")
    except Exception as exc:
        print(f"  error: unable to read file: {exc}")
        return False

    if not content.startswith("---"):
        print("  error: missing front matter delimiter")
        return False

    parts = content.split("---", 2)
    if len(parts) < 3:
        print("  error: malformed front matter block")
        return False

    try:
        data = yaml.safe_load(parts[1]) or {}
    except yaml.YAMLError as exc:
        print(f"  error: YAML parse failed: {exc}")
        return False

    if not isinstance(data, dict):
        print("  error: front matter is not a mapping")
        return False

    missing = [field for field in REQUIRED_FIELDS if field not in data]
    if missing:
        print(f"  error: missing required fields: {', '.join(missing)}")
        return False

    title = str(data.get("title") or "").strip()
    tags = data.get("tags")
    file_url = str(data.get("file_url") or "").strip()

    if not title:
        print("  error: title must not be empty")
        return False
    if not file_url:
        print("  error: file_url must not be empty")
        return False
    if tags is None:
        print("  error: tags must be present")
        return False
    if isinstance(tags, list) and not tags:
        print("  error: tags must not be empty")
        return False

    print("  ok")
    return True


def main() -> int:
    materials_dir = Path("content/materials")

    if not materials_dir.exists():
        print("content/materials directory does not exist")
        return 1

    md_files = iter_material_files(materials_dir)
    if not md_files:
        print("No Markdown files found")
        return 1

    valid_count = 0
    invalid_count = 0
    for md_file in md_files:
        if validate_markdown_file(md_file):
            valid_count += 1
        else:
            invalid_count += 1

    print(f"Validated {valid_count} files, {invalid_count} failed.")
    return 0 if invalid_count == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
