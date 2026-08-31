from __future__ import annotations

import json
import re
import sqlite3
from collections.abc import Iterable, Iterator, Sequence
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _fts_query(value: str) -> str:
    tokens = re.findall(r"[^\W_]+", value, flags=re.UNICODE)
    if not tokens:
        raise ValueError("Search query must contain at least one letter or number.")
    return " AND ".join(f'"{token.replace(chr(34), "")}"' for token in tokens[:24])


@dataclass(frozen=True)
class IndexedDocument:
    path: str
    title: str
    content: str
    sha256: str
    metadata: dict[str, Any]


class MemoryStore:
    """Persistent local memory backed by SQLite and FTS5."""

    def __init__(self, database_path: Path):
        self.database_path = database_path.expanduser().resolve()
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.database_path, timeout=30)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        try:
            yield connection
        finally:
            connection.close()

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                """
                PRAGMA journal_mode = WAL;

                CREATE TABLE IF NOT EXISTS repositories (
                    source_key TEXT PRIMARY KEY,
                    repository_url TEXT NOT NULL,
                    ref TEXT NOT NULL,
                    commit_sha TEXT NOT NULL,
                    local_path TEXT NOT NULL,
                    file_count INTEGER NOT NULL,
                    skipped_json TEXT NOT NULL,
                    indexed_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS documents (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    source_key TEXT NOT NULL REFERENCES repositories(source_key)
                        ON DELETE CASCADE,
                    path TEXT NOT NULL,
                    title TEXT NOT NULL,
                    content TEXT NOT NULL,
                    sha256 TEXT NOT NULL,
                    metadata_json TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    UNIQUE(source_key, path)
                );

                CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
                    document_id UNINDEXED,
                    source_key UNINDEXED,
                    path,
                    title,
                    content,
                    tokenize = 'unicode61 remove_diacritics 2'
                );

                CREATE TABLE IF NOT EXISTS memories (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    text TEXT NOT NULL,
                    tags_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
                    memory_id UNINDEXED,
                    text,
                    tags,
                    tokenize = 'unicode61 remove_diacritics 2'
                );

                CREATE TABLE IF NOT EXISTS notebook_syncs (
                    source_key TEXT NOT NULL,
                    notebook_key TEXT NOT NULL,
                    commit_sha TEXT NOT NULL,
                    source_names_json TEXT NOT NULL,
                    synced_at TEXT NOT NULL,
                    PRIMARY KEY(source_key, notebook_key)
                );
                """
            )
            connection.commit()

    def replace_repository_documents(
        self,
        *,
        source_key: str,
        repository_url: str,
        ref: str,
        commit_sha: str,
        local_path: str,
        documents: Sequence[IndexedDocument],
        skipped: dict[str, int],
    ) -> None:
        now = utc_now()
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute(
                """
                INSERT INTO repositories (
                    source_key, repository_url, ref, commit_sha, local_path,
                    file_count, skipped_json, indexed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(source_key) DO UPDATE SET
                    repository_url = excluded.repository_url,
                    ref = excluded.ref,
                    commit_sha = excluded.commit_sha,
                    local_path = excluded.local_path,
                    file_count = excluded.file_count,
                    skipped_json = excluded.skipped_json,
                    indexed_at = excluded.indexed_at
                """,
                (
                    source_key,
                    repository_url,
                    ref,
                    commit_sha,
                    local_path,
                    len(documents),
                    json.dumps(skipped, sort_keys=True),
                    now,
                ),
            )

            current_paths = {document.path for document in documents}
            stale_rows = connection.execute(
                "SELECT id FROM documents WHERE source_key = ?", (source_key,)
            ).fetchall()
            if current_paths:
                placeholders = ",".join("?" for _ in current_paths)
                stale_rows = connection.execute(
                    f"""SELECT id FROM documents
                        WHERE source_key = ? AND path NOT IN ({placeholders})""",
                    (source_key, *sorted(current_paths)),
                ).fetchall()

            for row in stale_rows:
                connection.execute(
                    "DELETE FROM documents_fts WHERE document_id = ?", (row["id"],)
                )
                connection.execute("DELETE FROM documents WHERE id = ?", (row["id"],))

            for document in documents:
                connection.execute(
                    """
                    INSERT INTO documents (
                        source_key, path, title, content, sha256,
                        metadata_json, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(source_key, path) DO UPDATE SET
                        title = excluded.title,
                        content = excluded.content,
                        sha256 = excluded.sha256,
                        metadata_json = excluded.metadata_json,
                        updated_at = excluded.updated_at
                    """,
                    (
                        source_key,
                        document.path,
                        document.title,
                        document.content,
                        document.sha256,
                        json.dumps(document.metadata, sort_keys=True),
                        now,
                    ),
                )
                row = connection.execute(
                    "SELECT id FROM documents WHERE source_key = ? AND path = ?",
                    (source_key, document.path),
                ).fetchone()
                document_id = int(row["id"])
                connection.execute(
                    "DELETE FROM documents_fts WHERE document_id = ?", (document_id,)
                )
                connection.execute(
                    """INSERT INTO documents_fts
                       (document_id, source_key, path, title, content)
                       VALUES (?, ?, ?, ?, ?)""",
                    (
                        document_id,
                        source_key,
                        document.path,
                        document.title,
                        document.content,
                    ),
                )
            connection.commit()

    def list_repositories(self) -> list[dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(
                """SELECT source_key, repository_url, ref, commit_sha, local_path,
                          file_count, skipped_json, indexed_at
                   FROM repositories ORDER BY indexed_at DESC"""
            ).fetchall()
        return [
            {
                **dict(row),
                "skipped": json.loads(row["skipped_json"]),
            }
            for row in rows
        ]

    def get_repository(self, source_key: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM repositories WHERE source_key = ?", (source_key,)
            ).fetchone()
        if row is None:
            return None
        value = dict(row)
        value["skipped"] = json.loads(value.pop("skipped_json"))
        return value

    def search_documents(
        self, query: str, *, limit: int = 8, source_key: str | None = None
    ) -> list[dict[str, Any]]:
        match_query = _fts_query(query)
        limit = max(1, min(int(limit), 25))
        sql = """
            SELECT document_id, source_key, path, title,
                   snippet(documents_fts, 4, '[', ']', ' … ', 30) AS snippet,
                   bm25(documents_fts, 2.0, 0.5, 1.0, 0.8) AS rank
            FROM documents_fts
            WHERE documents_fts MATCH ?
        """
        parameters: list[Any] = [match_query]
        if source_key:
            sql += " AND source_key = ?"
            parameters.append(source_key)
        sql += " ORDER BY rank LIMIT ?"
        parameters.append(limit)

        with self._connect() as connection:
            rows = connection.execute(sql, parameters).fetchall()
        return [dict(row) for row in rows]

    def get_document(
        self, source_key: str, path: str, *, max_chars: int = 20_000
    ) -> dict[str, Any] | None:
        max_chars = max(1_000, min(int(max_chars), 100_000))
        with self._connect() as connection:
            row = connection.execute(
                """SELECT source_key, path, title, content, sha256,
                          metadata_json, updated_at
                   FROM documents WHERE source_key = ? AND path = ?""",
                (source_key, path),
            ).fetchone()
        if row is None:
            return None
        content = row["content"]
        truncated = len(content) > max_chars
        return {
            "source_key": row["source_key"],
            "path": row["path"],
            "title": row["title"],
            "content": content[:max_chars],
            "truncated": truncated,
            "sha256": row["sha256"],
            "metadata": json.loads(row["metadata_json"]),
            "updated_at": row["updated_at"],
        }

    def iter_documents(self, source_key: str) -> Iterable[dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(
                """SELECT path, title, content, sha256, metadata_json
                   FROM documents WHERE source_key = ? ORDER BY path""",
                (source_key,),
            ).fetchall()
        for row in rows:
            yield {
                "path": row["path"],
                "title": row["title"],
                "content": row["content"],
                "sha256": row["sha256"],
                "metadata": json.loads(row["metadata_json"]),
            }

    def add_memory(self, text: str, tags: Sequence[str] = ()) -> dict[str, Any]:
        normalized = text.strip()
        if not normalized:
            raise ValueError("Memory text cannot be empty.")
        clean_tags = sorted({tag.strip() for tag in tags if tag.strip()})[:20]
        created_at = utc_now()
        with self._connect() as connection:
            cursor = connection.execute(
                "INSERT INTO memories (text, tags_json, created_at) VALUES (?, ?, ?)",
                (normalized, json.dumps(clean_tags), created_at),
            )
            memory_id = int(cursor.lastrowid)
            connection.execute(
                "INSERT INTO memories_fts (memory_id, text, tags) VALUES (?, ?, ?)",
                (memory_id, normalized, " ".join(clean_tags)),
            )
            connection.commit()
        return {
            "id": memory_id,
            "text": normalized,
            "tags": clean_tags,
            "created_at": created_at,
        }

    def search_memories(self, query: str, *, limit: int = 8) -> list[dict[str, Any]]:
        match_query = _fts_query(query)
        limit = max(1, min(int(limit), 25))
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT m.id, m.text, m.tags_json, m.created_at,
                       bm25(memories_fts) AS rank
                FROM memories_fts
                JOIN memories AS m ON m.id = CAST(memories_fts.memory_id AS INTEGER)
                WHERE memories_fts MATCH ?
                ORDER BY rank LIMIT ?
                """,
                (match_query, limit),
            ).fetchall()
        return [
            {
                "id": row["id"],
                "text": row["text"],
                "tags": json.loads(row["tags_json"]),
                "created_at": row["created_at"],
                "rank": row["rank"],
            }
            for row in rows
        ]

    def get_notebook_sync(
        self, source_key: str, notebook_key: str
    ) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                """SELECT source_key, notebook_key, commit_sha,
                          source_names_json, synced_at
                   FROM notebook_syncs
                   WHERE source_key = ? AND notebook_key = ?""",
                (source_key, notebook_key),
            ).fetchone()
        if row is None:
            return None
        return {
            "source_key": row["source_key"],
            "notebook_key": row["notebook_key"],
            "commit_sha": row["commit_sha"],
            "source_names": json.loads(row["source_names_json"]),
            "synced_at": row["synced_at"],
        }

    def save_notebook_sync(
        self,
        *,
        source_key: str,
        notebook_key: str,
        commit_sha: str,
        source_names: Sequence[str],
    ) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO notebook_syncs (
                    source_key, notebook_key, commit_sha,
                    source_names_json, synced_at
                ) VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(source_key, notebook_key) DO UPDATE SET
                    commit_sha = excluded.commit_sha,
                    source_names_json = excluded.source_names_json,
                    synced_at = excluded.synced_at
                """,
                (
                    source_key,
                    notebook_key,
                    commit_sha,
                    json.dumps(list(source_names)),
                    utc_now(),
                ),
            )
            connection.commit()
