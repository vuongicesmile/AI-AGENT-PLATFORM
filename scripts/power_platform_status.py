"""Read Power Platform status with PAC; never import, publish or change the tenant.

Connection metadata and all reports stay in the git-ignored .dataverse directory.
PAC owns authentication; this script never reads credentials or token caches.
"""

import argparse
import datetime as dt
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import uuid
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]


def fetch_xml(entity, attributes, solution_id, *, component_type=None,
              primary_id=None, page_size=None, order=None):
    # PAC adds a page attribute itself; FetchXML top cannot be used with paging.
    fetch = ET.Element("fetch", {"count": str(page_size)} if page_size else {})
    table = ET.SubElement(fetch, "entity", {"name": entity})
    for attribute in attributes:
        ET.SubElement(table, "attribute", {"name": attribute})
    if order:
        ET.SubElement(table, "order", {"attribute": order, "descending": "true"})
    scope = table
    if component_type is not None:
        scope = ET.SubElement(table, "link-entity", {
            "name": "solutioncomponent", "from": "objectid", "to": primary_id,
            "alias": "membership", "link-type": "exists",
        })
    conditions = ET.SubElement(scope, "filter")
    ET.SubElement(conditions, "condition", {
        "attribute": "solutionid", "operator": "eq", "value": solution_id,
    })
    if component_type is not None:
        ET.SubElement(conditions, "condition", {
            "attribute": "componenttype", "operator": "eq", "value": str(component_type),
        })
    return ET.tostring(fetch, encoding="unicode")


def find_pac():
    executable = shutil.which("pac")
    fallback = Path(os.environ.get("USERPROFILE", str(Path.home()))) / ".dotnet/tools/pac.exe"
    if executable:
        return executable
    if fallback.is_file():
        return str(fallback)
    raise RuntimeError("PAC missing. Install: dotnet tool install --global Microsoft.PowerApps.CLI.Tool")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=ROOT / ".dataverse/connection.json")
    parser.add_argument("--include-solution-history", action="store_true",
                        help="Also query solutionhistorydata (restricted in some tenants).")
    args = parser.parse_args()
    connection = json.loads(args.config.read_text(encoding="utf-8-sig"))
    environment = str(uuid.UUID(connection["environmentId"]))
    solution_id = str(uuid.UUID(connection["solutionId"]))
    pac = find_pac()
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    output = ROOT / ".dataverse/status" / stamp
    output.mkdir(parents=True)
    checks = []

    def run(label, command):
        print(f"Checking {label}...", flush=True)
        try:
            result = subprocess.run(command, cwd=ROOT, capture_output=True,
                                    text=True, encoding="utf-8", errors="replace", timeout=120)
            log = result.stdout + result.stderr
            code = result.returncode
        except subprocess.TimeoutExpired:
            log, code = "Timed out after 120 seconds. Status unknown; retry after checking authentication.\n", 124
        (output / f"{label}.txt").write_text(log, encoding="utf-8")
        checks.append({"check": label, "exitCode": code, "log": f"{label}.txt"})
        print(log, flush=True)
        return code

    def save():
        report = {
            "observedAtUtc": stamp, "environmentId": environment, "solutionId": solution_id,
            "checks": checks,
            "meaning": "Exit code 0 means the CLI query succeeded, not that deployment or publishing succeeded.",
            "limits": "PAC controls paging. Empty results are not proof of no pending changes. Git remote status uses the last fetch. Import job progress alone does not prove success.",
            "historyCoverage": "Import jobs; solutionhistorydata is opt-in because this tenant rejected that API.",
            "unverified": ["Unpublished drafts across all components", "Canvas live versions",
                           "Flow run results", "Deployment smoke tests"],
        }
        (output / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print(f"Report: {output}", flush=True)

    run("git-status", ["git", "status", "--short", "--branch"])
    run("git-head", ["git", "rev-parse", "HEAD"])
    if run("environment", [pac, "env", "who", "--environment", environment, "--json"]):
        save()
        return 1

    queries = {
        "solution": fetch_xml("solution", ["solutionid", "uniquename", "friendlyname", "version",
                               "ismanaged", "modifiedon", "installedon", "publisherid"], solution_id),
        "import-jobs": fetch_xml("importjob", ["importjobid", "solutionid", "solutionname",
                                  "startedon", "completedon", "progress", "modifiedon"],
                                 solution_id, page_size=100, order="startedon"),
        "model-apps": fetch_xml("appmodule", ["appmoduleid", "name", "uniquename", "statecode",
                                 "statuscode", "componentstate", "modifiedon", "publishedon"],
                                solution_id, component_type=80, primary_id="appmoduleid", page_size=100),
        "workflows": fetch_xml("workflow", ["workflowid", "name", "category", "type", "statecode",
                                "statuscode", "componentstate", "modifiedon"], solution_id,
                               component_type=29, primary_id="workflowid", page_size=100),
    }
    if args.include_solution_history:
        queries["history"] = fetch_xml("solutionhistorydata", ["solutionhistorydataid", "solutionname",
                                      "solutionversion", "operation", "suboperation", "status", "result",
                                      "starttime", "endtime", "errorcode", "exceptionmessage", "activityid"],
                                     solution_id, page_size=100, order="starttime")
    components = ET.fromstring(fetch_xml("solutioncomponent", [], solution_id))
    components.set("aggregate", "true")
    table = components.find("entity")
    ET.SubElement(table, "attribute", {"name": "componenttype", "alias": "type", "groupby": "true"})
    ET.SubElement(table, "attribute", {"name": "solutioncomponentid", "alias": "count", "aggregate": "count"})
    queries["components"] = ET.tostring(components, encoding="unicode")

    for label, query in queries.items():
        path = output / f"{label}.fetch.xml"
        path.write_text(query, encoding="utf-8")
        run(label, [pac, "env", "fetch", "--environment", environment, "--xmlFile", str(path)])
    save()
    return int(any(check["exitCode"] != 0 for check in checks))


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError, RuntimeError) as error:
        print(f"Status check failed: {error}", file=sys.stderr)
        sys.exit(1)
