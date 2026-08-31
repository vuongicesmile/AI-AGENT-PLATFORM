from __future__ import annotations

import json
import logging
import os
import re
import subprocess
import urllib.error
import urllib.request
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Any

from .exporter import NotebookBundle
from .storage import MemoryStore

LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True)
class GeminiNotebookConfig:
    project_number: str
    notebook_id: str
    location: str = "global"
    endpoint_location: str = "global"

    def __post_init__(self) -> None:
        if not self.project_number.isdigit():
            raise ValueError("GEMINI_NOTEBOOK_PROJECT_NUMBER must contain digits only.")
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,200}", self.notebook_id):
            raise ValueError("GEMINI_NOTEBOOK_ID has an invalid format.")
        if self.location not in {"global", "us", "eu"}:
            raise ValueError("GEMINI_NOTEBOOK_LOCATION must be global, us, or eu.")
        if self.endpoint_location not in {"global", "us", "eu"}:
            raise ValueError(
                "GEMINI_NOTEBOOK_ENDPOINT_LOCATION must be global, us, or eu."
            )

    @property
    def notebook_key(self) -> str:
        return (
            f"projects/{self.project_number}/locations/{self.location}/"
            f"notebooks/{self.notebook_id}"
        )

    @classmethod
    def from_env(cls) -> GeminiNotebookConfig:
        project_number = os.environ.get("GEMINI_NOTEBOOK_PROJECT_NUMBER", "").strip()
        notebook_id = os.environ.get("GEMINI_NOTEBOOK_ID", "").strip()
        if not project_number or not notebook_id:
            raise RuntimeError(
                "Gemini Notebook Enterprise is not configured. Set "
                "GEMINI_NOTEBOOK_PROJECT_NUMBER and GEMINI_NOTEBOOK_ID."
            )
        return cls(
            project_number=project_number,
            notebook_id=notebook_id,
            location=os.environ.get("GEMINI_NOTEBOOK_LOCATION", "global").strip(),
            endpoint_location=os.environ.get(
                "GEMINI_NOTEBOOK_ENDPOINT_LOCATION", "global"
            ).strip(),
        )


class GeminiNotebookEnterpriseClient:
    """Minimal official REST adapter; it never stores Google access tokens."""

    def __init__(
        self,
        config: GeminiNotebookConfig,
        *,
        token_provider: Callable[[], str] | None = None,
        request_json: Callable[[str, str, dict[str, Any] | None], dict[str, Any]]
        | None = None,
    ):
        self.config = config
        self._token_provider = token_provider or self._gcloud_access_token
        self._request_json_override = request_json

    @property
    def _api_root(self) -> str:
        return (
            f"https://{self.config.endpoint_location}-discoveryengine.googleapis.com/"
            f"v1alpha/{self.config.notebook_key}"
        )

    @staticmethod
    def _gcloud_access_token() -> str:
        configured = os.environ.get("GOOGLE_OAUTH_ACCESS_TOKEN", "").strip()
        if configured:
            return configured
        try:
            result = subprocess.run(
                ["gcloud", "auth", "print-access-token"],
                check=True,
                capture_output=True,
                text=True,
                encoding="utf-8",
                timeout=30,
            )
        except FileNotFoundError as exc:
            raise RuntimeError(
                "Google Cloud CLI is required. Install gcloud and run `gcloud auth login`."
            ) from exc
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
            raise RuntimeError(
                "Could not obtain a Google access token. Run `gcloud auth login` and retry."
            ) from exc
        token = result.stdout.strip()
        if not token:
            raise RuntimeError("gcloud returned an empty access token.")
        return token

    def _request_json(
        self, method: str, url: str, payload: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        if self._request_json_override:
            return self._request_json_override(method, url, payload)

        body = None if payload is None else json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            url,
            data=body,
            method=method,
            headers={
                "Authorization": f"Bearer {self._token_provider()}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                response_body = response.read()
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:2_000]
            raise RuntimeError(
                f"Gemini Notebook API returned HTTP {exc.code}: {detail}"
            ) from exc
        except urllib.error.URLError as exc:
            raise RuntimeError(
                f"Gemini Notebook API connection failed: {exc.reason}"
            ) from exc
        if not response_body:
            return {}
        return json.loads(response_body.decode("utf-8"))

    def create_text_sources(self, bundles: Sequence[NotebookBundle]) -> list[str]:
        created_names: list[str] = []
        try:
            for bundle in bundles:
                result = self._request_json(
                    "POST",
                    f"{self._api_root}/sources:batchCreate",
                    {
                        "userContents": [
                            {
                                "textContent": {
                                    "sourceName": bundle.name,
                                    "content": bundle.content,
                                }
                            }
                        ]
                    },
                )
                sources = result.get("sources") or []
                if not sources or not sources[0].get("name"):
                    raise RuntimeError(
                        "Gemini Notebook API did not return a source resource name."
                    )
                created_names.append(str(sources[0]["name"]))
        except Exception:
            if created_names:
                try:
                    self.delete_sources(created_names)
                except (RuntimeError, ValueError) as cleanup_error:
                    LOGGER.warning(
                        "Could not roll back partially created Gemini Notebook sources: %s",
                        cleanup_error,
                    )
            raise
        return created_names

    def delete_sources(self, source_names: Sequence[str]) -> None:
        if not source_names:
            return
        expected_prefix = f"{self.config.notebook_key}/sources/"
        if any(not value.startswith(expected_prefix) for value in source_names):
            raise ValueError(
                "Refusing to delete a source outside the configured notebook."
            )
        self._request_json(
            "POST",
            f"{self._api_root}/sources:batchDelete",
            {"names": list(source_names)},
        )


class GeminiNotebookSync:
    def __init__(self, *, store: MemoryStore, client: GeminiNotebookEnterpriseClient):
        self.store = store
        self.client = client

    def sync(
        self,
        *,
        source_key: str,
        commit_sha: str,
        bundles: Sequence[NotebookBundle],
        replace_previous: bool = True,
    ) -> dict[str, Any]:
        notebook_key = self.client.config.notebook_key
        previous = self.store.get_notebook_sync(source_key, notebook_key)
        if previous and previous["commit_sha"] == commit_sha:
            return {
                "status": "already_current",
                "source_key": source_key,
                "commit_sha": commit_sha,
                "notebook_key": notebook_key,
                "source_names": previous["source_names"],
            }

        new_source_names = self.client.create_text_sources(bundles)
        old_source_names = previous["source_names"] if previous else []
        deleted_previous = False
        if replace_previous and old_source_names:
            self.client.delete_sources(old_source_names)
            deleted_previous = True

        self.store.save_notebook_sync(
            source_key=source_key,
            notebook_key=notebook_key,
            commit_sha=commit_sha,
            source_names=new_source_names,
        )
        return {
            "status": "synced",
            "source_key": source_key,
            "commit_sha": commit_sha,
            "notebook_key": notebook_key,
            "created_sources": new_source_names,
            "deleted_previous": deleted_previous,
        }
