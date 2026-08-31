from __future__ import annotations

import hashlib
import re
import subprocess
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path, PurePosixPath

from .storage import IndexedDocument, MemoryStore

GITHUB_REPOSITORY_RE = re.compile(
    r"^https://github\.com/(?P<owner>[A-Za-z0-9_.-]+)/(?P<repo>[A-Za-z0-9_.-]+?)(?:\.git)?/?$"
)

TEXT_EXTENSIONS = {
    ".c",
    ".cc",
    ".cfg",
    ".conf",
    ".cpp",
    ".cs",
    ".css",
    ".csv",
    ".dart",
    ".env.example",
    ".go",
    ".graphql",
    ".h",
    ".hpp",
    ".html",
    ".ini",
    ".java",
    ".js",
    ".json",
    ".jsx",
    ".kt",
    ".kts",
    ".less",
    ".lua",
    ".md",
    ".mdx",
    ".mjs",
    ".php",
    ".ps1",
    ".py",
    ".rb",
    ".rs",
    ".sass",
    ".scss",
    ".sh",
    ".sql",
    ".svelte",
    ".swift",
    ".toml",
    ".ts",
    ".tsx",
    ".txt",
    ".vue",
    ".xml",
    ".yaml",
    ".yml",
}

EXCLUDED_PARTS = {
    ".git",
    ".idea",
    ".next",
    ".pytest_cache",
    ".venv",
    ".vscode",
    "bin",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "obj",
    "out",
    "target",
    "venv",
}

SENSITIVE_BASENAMES = {
    ".npmrc",
    ".pypirc",
    "credentials.json",
    "id_ed25519",
    "id_rsa",
    "service-account.json",
}

SENSITIVE_SUFFIXES = {".jks", ".key", ".p12", ".pem", ".pfx"}

HIGH_CONFIDENCE_SECRET_PATTERNS = (
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(r"\bgithub_pat_[A-Za-z0-9_]{30,}\b"),
    re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}\b"),
    re.compile(r"\bsk-[A-Za-z0-9_-]{24,}\b"),
)


@dataclass(frozen=True)
class RepositoryIdentity:
    owner: str
    repository: str

    @property
    def source_key(self) -> str:
        return f"github:{self.owner.lower()}/{self.repository.lower()}"

    @property
    def slug(self) -> str:
        return f"{self.owner}__{self.repository}"


class RepositoryIndexer:
    def __init__(
        self,
        *,
        data_dir: Path,
        store: MemoryStore,
        allowed_roots: Sequence[Path] = (),
        max_file_bytes: int = 256_000,
    ):
        self.data_dir = data_dir.expanduser().resolve()
        self.store = store
        self.allowed_roots = tuple(
            root.expanduser().resolve() for root in allowed_roots
        )
        self.max_file_bytes = max(1_024, int(max_file_bytes))
        self.repositories_dir = self.data_dir / "repositories"
        self.repositories_dir.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def parse_github_url(repository_url: str) -> RepositoryIdentity:
        match = GITHUB_REPOSITORY_RE.fullmatch(repository_url.strip())
        if not match:
            raise ValueError(
                "Only canonical HTTPS GitHub repository URLs are accepted, for example "
                "https://github.com/owner/repository."
            )
        return RepositoryIdentity(match.group("owner"), match.group("repo"))

    @staticmethod
    def _run_git(arguments: Sequence[str], *, cwd: Path | None = None) -> str:
        try:
            result = subprocess.run(
                ["git", *arguments],
                cwd=cwd,
                check=True,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=180,
            )
        except FileNotFoundError as exc:
            raise RuntimeError("Git is required but was not found on PATH.") from exc
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError("Git command timed out after 180 seconds.") from exc
        except subprocess.CalledProcessError as exc:
            message = (exc.stderr or exc.stdout or "Git command failed").strip()
            raise RuntimeError(message[-2_000:]) from exc
        return result.stdout.strip()

    def _prepare_clone(self, repository_url: str, ref: str) -> Path:
        identity = self.parse_github_url(repository_url)
        target = self.repositories_dir / identity.slug
        safe_ref = ref.strip() or "HEAD"
        if target.exists() and not (target / ".git").is_dir():
            raise RuntimeError(
                f"Managed repository path exists but is not a Git clone: {target}"
            )

        if not target.exists():
            target.mkdir(parents=True)
            self._run_git(["init", "--quiet"], cwd=target)
            self._run_git(["remote", "add", "origin", repository_url], cwd=target)
        else:
            origin = self._run_git(["remote", "get-url", "origin"], cwd=target)
            existing = self.parse_github_url(origin)
            if existing != identity:
                raise RuntimeError(
                    "Managed clone origin does not match the requested repository."
                )

        self._run_git(["fetch", "--depth=1", "origin", safe_ref], cwd=target)
        self._run_git(
            ["-c", "advice.detachedHead=false", "checkout", "--detach", "FETCH_HEAD"],
            cwd=target,
        )
        return target

    def index_github(self, repository_url: str, ref: str = "HEAD") -> dict[str, object]:
        identity = self.parse_github_url(repository_url)
        repository_path = self._prepare_clone(repository_url, ref)
        return self._index_git_worktree(
            repository_path=repository_path,
            source_key=identity.source_key,
            repository_url=f"https://github.com/{identity.owner}/{identity.repository}",
            ref=ref.strip() or "HEAD",
        )

    def index_local(
        self, path: str, repository_label: str | None = None
    ) -> dict[str, object]:
        repository_path = Path(path).expanduser().resolve()
        if not self.allowed_roots:
            raise PermissionError(
                "Local repository indexing is disabled. Set AI_AGENT_ALLOWED_ROOTS to one "
                "or more approved directories first."
            )
        if not any(
            repository_path == root or repository_path.is_relative_to(root)
            for root in self.allowed_roots
        ):
            raise PermissionError("Requested path is outside AI_AGENT_ALLOWED_ROOTS.")
        if not repository_path.is_dir():
            raise FileNotFoundError(
                f"Local repository does not exist: {repository_path}"
            )
        if not (repository_path / ".git").exists():
            raise ValueError("Local path must be a Git working tree.")

        label = (repository_label or repository_path.name).strip()
        if not re.fullmatch(r"[A-Za-z0-9_.-]{1,100}", label):
            raise ValueError(
                "repository_label may contain only letters, numbers, dot, dash, underscore."
            )
        source_key = f"local:{label.lower()}"
        return self._index_git_worktree(
            repository_path=repository_path,
            source_key=source_key,
            repository_url=f"file://{repository_path.as_posix()}",
            ref="working-tree",
        )

    def _index_git_worktree(
        self,
        *,
        repository_path: Path,
        source_key: str,
        repository_url: str,
        ref: str,
    ) -> dict[str, object]:
        commit_sha = self._run_git(["rev-parse", "HEAD"], cwd=repository_path)
        tracked_output = subprocess.run(
            ["git", "ls-files", "-z"],
            cwd=repository_path,
            check=True,
            capture_output=True,
            timeout=60,
        ).stdout
        tracked_paths = [
            value.decode("utf-8", errors="surrogateescape")
            for value in tracked_output.split(b"\0")
            if value
        ]

        documents: list[IndexedDocument] = []
        skipped = {
            "unsupported": 0,
            "excluded": 0,
            "too_large": 0,
            "binary": 0,
            "sensitive_path": 0,
            "suspected_secret": 0,
            "unreadable": 0,
        }
        for relative_path in tracked_paths:
            result = self._read_document(repository_path, relative_path, commit_sha)
            if isinstance(result, str):
                skipped[result] += 1
            else:
                documents.append(result)

        self.store.replace_repository_documents(
            source_key=source_key,
            repository_url=repository_url,
            ref=ref,
            commit_sha=commit_sha,
            local_path=str(repository_path),
            documents=documents,
            skipped=skipped,
        )
        return {
            "source_key": source_key,
            "repository_url": repository_url,
            "ref": ref,
            "commit_sha": commit_sha,
            "local_path": str(repository_path),
            "indexed_files": len(documents),
            "skipped": skipped,
        }

    def _read_document(
        self, repository_path: Path, relative_path: str, commit_sha: str
    ) -> IndexedDocument | str:
        pure_path = PurePosixPath(relative_path)
        lower_parts = {part.lower() for part in pure_path.parts}
        if lower_parts & EXCLUDED_PARTS:
            return "excluded"

        basename = pure_path.name.lower()
        suffix = pure_path.suffix.lower()
        if basename.startswith(".env") and basename not in {
            ".env.example",
            ".env.template",
        }:
            return "sensitive_path"
        if basename in SENSITIVE_BASENAMES or suffix in SENSITIVE_SUFFIXES:
            return "sensitive_path"

        extension = suffix
        if basename in {".env.example", ".env.template"}:
            extension = ".env.example"
        if basename in {"dockerfile", "gemfile", "makefile", "procfile"}:
            extension = basename
        if extension not in TEXT_EXTENSIONS and basename not in {
            "dockerfile",
            "gemfile",
            "makefile",
            "procfile",
        }:
            return "unsupported"

        absolute_path = (repository_path / Path(*pure_path.parts)).resolve()
        try:
            if not absolute_path.is_relative_to(repository_path.resolve()):
                return "excluded"
            size = absolute_path.stat().st_size
            if size > self.max_file_bytes:
                return "too_large"
            raw = absolute_path.read_bytes()
        except (OSError, ValueError):
            return "unreadable"

        if b"\x00" in raw:
            return "binary"
        try:
            content = raw.decode("utf-8-sig")
        except UnicodeDecodeError:
            return "binary"
        if any(pattern.search(content) for pattern in HIGH_CONFIDENCE_SECRET_PATTERNS):
            return "suspected_secret"

        return IndexedDocument(
            path=pure_path.as_posix(),
            title=pure_path.name,
            content=content,
            sha256=hashlib.sha256(raw).hexdigest(),
            metadata={"commit_sha": commit_sha, "bytes": len(raw)},
        )
