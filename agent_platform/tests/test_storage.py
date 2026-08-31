from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from github_notebook_memory.storage import IndexedDocument, MemoryStore


class MemoryStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.store = MemoryStore(Path(self.temporary.name) / "memory.sqlite3")

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def test_repository_documents_are_searchable_and_replace_stale_rows(self) -> None:
        self.store.replace_repository_documents(
            source_key="github:owner/repo",
            repository_url="https://github.com/owner/repo",
            ref="main",
            commit_sha="a" * 40,
            local_path="/tmp/repo",
            documents=[
                IndexedDocument(
                    path="src/alpha.py",
                    title="alpha.py",
                    content="def calculate_invoice_total():\n    return 42\n",
                    sha256="1" * 64,
                    metadata={"bytes": 44},
                ),
                IndexedDocument(
                    path="src/stale.py",
                    title="stale.py",
                    content="obsolete yellow submarine",
                    sha256="2" * 64,
                    metadata={"bytes": 25},
                ),
            ],
            skipped={"unsupported": 0},
        )

        result = self.store.search_documents("invoice total")
        self.assertEqual(result[0]["path"], "src/alpha.py")

        self.store.replace_repository_documents(
            source_key="github:owner/repo",
            repository_url="https://github.com/owner/repo",
            ref="main",
            commit_sha="b" * 40,
            local_path="/tmp/repo",
            documents=[
                IndexedDocument(
                    path="src/alpha.py",
                    title="alpha.py",
                    content="def calculate_invoice_total():\n    return 84\n",
                    sha256="3" * 64,
                    metadata={"bytes": 44},
                )
            ],
            skipped={"unsupported": 0},
        )
        self.assertEqual(self.store.search_documents("yellow submarine"), [])
        document = self.store.get_document("github:owner/repo", "src/alpha.py")
        self.assertIn("84", document["content"])

    def test_user_memory_is_persistent_and_searchable(self) -> None:
        created = self.store.add_memory(
            "Use SQLite FTS5 for local repository memory.", ["architecture", "local"]
        )
        self.assertGreater(created["id"], 0)
        results = self.store.search_memories("SQLite memory")
        self.assertEqual(results[0]["tags"], ["architecture", "local"])

    def test_invalid_search_query_fails_cleanly(self) -> None:
        with self.assertRaises(ValueError):
            self.store.search_documents("---")


if __name__ == "__main__":
    unittest.main()
