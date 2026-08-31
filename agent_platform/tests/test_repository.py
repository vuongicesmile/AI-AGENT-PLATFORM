from __future__ import annotations

import subprocess
import tempfile
import unittest
from pathlib import Path

from github_notebook_memory.repository import RepositoryIndexer
from github_notebook_memory.storage import MemoryStore


class RepositoryIndexerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.repository = self.root / "sample"
        self.repository.mkdir()
        subprocess.run(["git", "init", "--quiet"], cwd=self.repository, check=True)
        subprocess.run(
            ["git", "config", "user.email", "tests@example.com"],
            cwd=self.repository,
            check=True,
        )
        subprocess.run(
            ["git", "config", "user.name", "Tests"], cwd=self.repository, check=True
        )
        (self.repository / "src").mkdir()
        (self.repository / "src" / "main.py").write_text(
            "def hello():\n    return 'xin chao'\n", encoding="utf-8"
        )
        (self.repository / ".env").write_text("SECRET=do-not-index", encoding="utf-8")
        (self.repository / "token.txt").write_text(
            "github_pat_abcdefghijklmnopqrstuvwxyzABCDEFGHIJK", encoding="utf-8"
        )
        (self.repository / "image.bin").write_bytes(b"\x00\x01")
        subprocess.run(["git", "add", "."], cwd=self.repository, check=True)
        subprocess.run(
            ["git", "commit", "--quiet", "-m", "fixture"],
            cwd=self.repository,
            check=True,
        )
        self.store = MemoryStore(self.root / "data" / "memory.sqlite3")
        self.indexer = RepositoryIndexer(
            data_dir=self.root / "data",
            store=self.store,
            allowed_roots=[self.root],
        )

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def test_local_index_skips_credentials_and_binary_files(self) -> None:
        result = self.indexer.index_local(str(self.repository), "sample")
        self.assertEqual(result["indexed_files"], 1)
        self.assertEqual(result["skipped"]["sensitive_path"], 1)
        self.assertEqual(result["skipped"]["suspected_secret"], 1)
        self.assertEqual(result["skipped"]["unsupported"], 1)
        found = self.store.search_documents("xin chao")
        self.assertEqual(found[0]["path"], "src/main.py")

    def test_local_index_requires_an_approved_root(self) -> None:
        disabled = RepositoryIndexer(data_dir=self.root / "other", store=self.store)
        with self.assertRaises(PermissionError):
            disabled.index_local(str(self.repository), "sample")

    def test_github_url_validation_rejects_credentials_and_non_github_hosts(
        self,
    ) -> None:
        with self.assertRaises(ValueError):
            self.indexer.parse_github_url("https://token@github.com/owner/repo")
        with self.assertRaises(ValueError):
            self.indexer.parse_github_url("https://example.com/owner/repo")
        identity = self.indexer.parse_github_url("https://github.com/Owner/Repo.git")
        self.assertEqual(identity.source_key, "github:owner/repo")


if __name__ == "__main__":
    unittest.main()
