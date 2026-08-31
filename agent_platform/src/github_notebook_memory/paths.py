from __future__ import annotations

import os
import sys
from pathlib import Path


def default_data_dir() -> Path:
    """Return a per-user data directory without writing anything."""
    configured = os.environ.get("AI_AGENT_DATA_DIR")
    if configured:
        return Path(configured).expanduser().resolve()

    if sys.platform == "win32":
        base = os.environ.get("LOCALAPPDATA")
        if base:
            return Path(base) / "AI-Agent-Platform"
        return Path.home() / "AppData" / "Local" / "AI-Agent-Platform"

    xdg_data_home = os.environ.get("XDG_DATA_HOME")
    if xdg_data_home:
        return Path(xdg_data_home).expanduser() / "ai-agent-platform"
    return Path.home() / ".local" / "share" / "ai-agent-platform"


def configured_allowed_roots() -> tuple[Path, ...]:
    """Read opt-in roots that the local-repository tool may access."""
    raw = os.environ.get("AI_AGENT_ALLOWED_ROOTS", "").strip()
    if not raw:
        return ()

    roots: list[Path] = []
    for item in raw.split(os.pathsep):
        item = item.strip()
        if item:
            roots.append(Path(item).expanduser().resolve())
    return tuple(roots)
