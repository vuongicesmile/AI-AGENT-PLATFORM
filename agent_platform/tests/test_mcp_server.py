from __future__ import annotations

import unittest

from github_notebook_memory.server import mcp
from mcp import Client


class MCPServerTests(unittest.IsolatedAsyncioTestCase):
    async def test_server_advertises_expected_tools_and_annotations(self) -> None:
        async with Client(mcp) as client:
            result = await client.list_tools()
        tools = {tool.name: tool for tool in result.tools}
        self.assertIn("index_github_repository", tools)
        self.assertIn("search_repository_memory", tools)
        self.assertIn("sync_gemini_notebook_enterprise", tools)
        self.assertTrue(tools["search_repository_memory"].annotations.read_only_hint)
        self.assertTrue(
            tools["sync_gemini_notebook_enterprise"].annotations.destructive_hint
        )


if __name__ == "__main__":
    unittest.main()
