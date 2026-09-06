"""Invoke the installed FlowAgent MCP bundle using its public stdio protocol.

Authentication stays in FlowAgent/Azure CLI. This script never reads token caches.
Tool payloads and results belong in .dataverse when they contain environment IDs.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--server", required=True)
    parser.add_argument("--tool")
    parser.add_argument("--args-file")
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    env = os.environ.copy()
    env["PATH"] = str(root / ".tools/azure-cli/Scripts") + os.pathsep + env["PATH"]
    child = subprocess.Popen(["node", args.server], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                             stderr=subprocess.DEVNULL, text=True, encoding="utf-8", env=env)
    counter = 0

    def send(method, params, notification=False):
        nonlocal counter
        counter += 1
        message = {"jsonrpc": "2.0", "method": method, "params": params}
        if not notification:
            message["id"] = counter
        child.stdin.write(json.dumps(message) + "\n")
        child.stdin.flush()
        if notification:
            return None
        for line in child.stdout:
            try:
                reply = json.loads(line)
            except json.JSONDecodeError:
                continue
            if reply.get("id") == counter:
                if "error" in reply:
                    raise RuntimeError(json.dumps(reply["error"]))
                return reply["result"]
        raise RuntimeError("FlowAgent closed before responding")

    try:
        send("initialize", {"protocolVersion": "2024-11-05", "capabilities": {},
                            "clientInfo": {"name": "sales-demo-cli", "version": "1.0.0"}})
        send("notifications/initialized", {}, True)
        payload = json.loads(Path(args.args_file).read_text(encoding="utf-8")) if args.args_file else {}
        result = send("tools/call", {"name": args.tool, "arguments": payload}) if args.tool else send("tools/list", {})
        out = Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"saved": str(out), "isError": result.get("isError", False),
                          "tools": [x["name"] for x in result.get("tools", [])]}))
        return 1 if result.get("isError") else 0
    finally:
        child.terminate()
        try:
            child.wait(timeout=5)
        except subprocess.TimeoutExpired:
            child.kill()
            child.wait()


if __name__ == "__main__":
    sys.exit(main())
