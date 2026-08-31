from __future__ import annotations

import argparse
import json
from typing import Any

from .server import main as server_main
from .service import NotebookMemoryService


def _write_json(value: Any) -> None:
    print(json.dumps(value, ensure_ascii=False, indent=2))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="github-notebook-memory",
        description="Extract repositories, search local memory, and sync Gemini Notebook.",
    )
    commands = parser.add_subparsers(dest="command", required=True)

    index = commands.add_parser(
        "index-github", help="Clone and index a GitHub repository."
    )
    index.add_argument("repository_url")
    index.add_argument("--ref", default="HEAD")

    index_local = commands.add_parser(
        "index-local", help="Index an approved local Git repository."
    )
    index_local.add_argument("path")
    index_local.add_argument("--label")

    commands.add_parser("list", help="List indexed repositories.")

    search = commands.add_parser("search", help="Search indexed repository content.")
    search.add_argument("query")
    search.add_argument("--source-key")
    search.add_argument("--limit", type=int, default=8)

    remember = commands.add_parser("remember", help="Add a user-approved local memory.")
    remember.add_argument("text")
    remember.add_argument("--tag", action="append", default=[])

    recall = commands.add_parser("recall", help="Search user-approved local memories.")
    recall.add_argument("query")
    recall.add_argument("--limit", type=int, default=8)

    export = commands.add_parser(
        "export", help="Export Markdown bundles for personal NotebookLM."
    )
    export.add_argument("source_key")
    export.add_argument("--max-chars", type=int, default=120_000)

    sync = commands.add_parser(
        "sync-enterprise", help="Sync through the official Enterprise API."
    )
    sync.add_argument("source_key")
    sync.add_argument("--keep-previous", action="store_true")
    sync.add_argument("--max-chars", type=int, default=120_000)

    commands.add_parser("serve", help="Run the MCP server; pass server flags after --.")
    return parser


def main() -> None:
    parser = build_parser()
    arguments, remaining = parser.parse_known_args()
    if arguments.command == "serve":
        import sys

        sys.argv = [sys.argv[0], *remaining]
        server_main()
        return

    service = NotebookMemoryService()
    if arguments.command == "index-github":
        result = service.index_github_repository(
            arguments.repository_url, arguments.ref
        )
    elif arguments.command == "index-local":
        result = service.index_local_repository(arguments.path, arguments.label)
    elif arguments.command == "list":
        result = service.list_repositories()
    elif arguments.command == "search":
        result = service.search_repository_memory(
            arguments.query, arguments.limit, arguments.source_key
        )
    elif arguments.command == "remember":
        result = service.remember(arguments.text, arguments.tag)
    elif arguments.command == "recall":
        result = service.recall(arguments.query, arguments.limit)
    elif arguments.command == "export":
        result = service.export_notebook_bundle(
            arguments.source_key, arguments.max_chars
        )
    elif arguments.command == "sync-enterprise":
        result = service.sync_gemini_notebook(
            arguments.source_key,
            replace_previous=not arguments.keep_previous,
            max_chars=arguments.max_chars,
        )
    else:
        parser.error(f"Unknown command: {arguments.command}")
        return
    _write_json(result)


if __name__ == "__main__":
    main()
