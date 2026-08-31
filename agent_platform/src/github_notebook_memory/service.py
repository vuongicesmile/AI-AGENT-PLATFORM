from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path
from typing import Any

from .exporter import NotebookExporter
from .notebook_enterprise import (
    GeminiNotebookConfig,
    GeminiNotebookEnterpriseClient,
    GeminiNotebookSync,
)
from .paths import configured_allowed_roots, default_data_dir
from .repository import RepositoryIndexer
from .storage import MemoryStore


class NotebookMemoryService:
    def __init__(
        self,
        *,
        data_dir: Path | None = None,
        allowed_roots: Sequence[Path] | None = None,
    ):
        self.data_dir = (data_dir or default_data_dir()).expanduser().resolve()
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.store = MemoryStore(self.data_dir / "memory.sqlite3")
        self.indexer = RepositoryIndexer(
            data_dir=self.data_dir,
            store=self.store,
            allowed_roots=(
                tuple(allowed_roots)
                if allowed_roots is not None
                else configured_allowed_roots()
            ),
        )
        self.exporter = NotebookExporter(data_dir=self.data_dir, store=self.store)

    def index_github_repository(
        self, repository_url: str, ref: str = "HEAD"
    ) -> dict[str, object]:
        return self.indexer.index_github(repository_url, ref)

    def index_local_repository(
        self, path: str, repository_label: str | None = None
    ) -> dict[str, object]:
        return self.indexer.index_local(path, repository_label)

    def list_repositories(self) -> list[dict[str, Any]]:
        return self.store.list_repositories()

    def search_repository_memory(
        self, query: str, limit: int = 8, source_key: str | None = None
    ) -> list[dict[str, Any]]:
        return self.store.search_documents(query, limit=limit, source_key=source_key)

    def read_repository_document(
        self, source_key: str, path: str, max_chars: int = 20_000
    ) -> dict[str, Any]:
        document = self.store.get_document(source_key, path, max_chars=max_chars)
        if document is None:
            raise KeyError(f"Document not found: {source_key} / {path}")
        return document

    def remember(self, text: str, tags: Sequence[str] = ()) -> dict[str, Any]:
        return self.store.add_memory(text, tags)

    def recall(self, query: str, limit: int = 8) -> list[dict[str, Any]]:
        return self.store.search_memories(query, limit=limit)

    def export_notebook_bundle(
        self, source_key: str, max_chars: int = 120_000
    ) -> dict[str, object]:
        return self.exporter.export(source_key, max_chars=max_chars)

    def sync_gemini_notebook(
        self,
        source_key: str,
        *,
        replace_previous: bool = True,
        max_chars: int = 120_000,
        config: GeminiNotebookConfig | None = None,
        client: GeminiNotebookEnterpriseClient | None = None,
    ) -> dict[str, Any]:
        repository = self.store.get_repository(source_key)
        if repository is None:
            raise KeyError(f"Unknown source_key: {source_key}")
        bundles = self.exporter.build_bundles(source_key, max_chars=max_chars)
        active_client = client or GeminiNotebookEnterpriseClient(
            config or GeminiNotebookConfig.from_env()
        )
        sync = GeminiNotebookSync(store=self.store, client=active_client)
        return sync.sync(
            source_key=source_key,
            commit_sha=repository["commit_sha"],
            bundles=bundles,
            replace_previous=replace_previous,
        )
