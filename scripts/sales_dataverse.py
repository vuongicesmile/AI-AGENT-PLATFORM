"""Sales Demo deployment helpers using the installed Microsoft Dataverse SDK/auth.

Connection IDs and execution receipts stay in .dataverse (gitignored).
The SDK handles record CRUD. Web API is reserved for actions and metadata
operations not exposed by the Python SDK, with first-party attribution headers.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]


class DemoDataverse:
    def __init__(self, skill="dv-metadata"):
        self.connection = json.loads((ROOT / ".dataverse/connection.json").read_text(encoding="utf-8-sig"))
        os.environ["PATH"] = str(ROOT / ".tools/azure-cli/Scripts") + os.pathsep + os.environ["PATH"]
        tenant = subprocess.check_output([str(ROOT / ".tools/azure-cli/Scripts/python.exe"),
            "-m", "azure.cli", "account", "show", "--query", "tenantId", "--output", "tsv"], text=True).strip()
        os.environ.update(DATAVERSE_URL=self.connection["environmentUrl"].rstrip("/"),
            TENANT_ID=tenant, DATAVERSE_PLUGIN_VERSION="1.12.1", DATAVERSE_PLUGIN_AGENT="codex")
        plugin = Path.home() / ".codex/plugins/cache/dataverse-skills/dataverse/1.12.1/scripts"
        sys.path.insert(0, str(plugin))
        import auth
        import requests
        self.auth, self.requests, self.skill = auth, requests, skill
        self.client = auth.get_client(skill)
        self.url = os.environ["DATAVERSE_URL"] + "/api/data/v9.2/"
        self.solution = self.connection["solutionUniqueName"]
        solutions = self.rows("solution", "uniquename eq '" + self.solution.replace("'", "''") + "'", ["solutionid", "ismanaged"])
        if len(solutions) != 1 or solutions[0]["solutionid"] != self.connection["solutionId"] or solutions[0]["ismanaged"]:
            raise RuntimeError("Expected selected unmanaged solution; refusing to continue")

    def rows(self, table, filter, select=None, top=100):
        return [dict(row) for row in self.client.records.list(table, filter=filter, select=select, top=top)]

    def api(self, method, path, payload=None, *, representation=False):
        # Only call for SDK gaps: CSDL, specialized metadata updates and unbound actions.
        headers = self.auth.get_plugin_headers(self.skill, self.auth.get_token())
        headers.update({"Accept": "application/xml" if path == "$metadata" else "application/json", "OData-Version": "4.0",
            "MSCRM.SolutionName": self.solution, "MSCRM.SolutionUniqueName": self.solution})
        if representation:
            headers["Prefer"] = "return=representation"
        response = self.requests.request(method, self.url + path, headers=headers, json=payload, timeout=120)
        if not response.ok:
            raise RuntimeError(f"Dataverse {method} {path.split('?')[0]}: {response.status_code} {response.text[:1800]}")
        if not response.content:
            return None
        return response.json() if "json" in response.headers.get("Content-Type", "") else response.text

    def add_component(self, record_id, component_type):
        return self.api("POST", "AddSolutionComponent", {"ComponentId": record_id,
            "ComponentType": component_type, "SolutionUniqueName": self.solution, "AddRequiredComponents": False})

    def ensure(self, table, filter, data, component_type=None):
        rows = self.rows(table, filter, [table + "id"], top=2)
        if len(rows) > 1:
            raise RuntimeError("Ambiguous existing component: " + table)
        record_id = rows[0][table + "id"] if rows else self.client.records.create(table, data)
        if component_type is not None:
            self.add_component(record_id, component_type)
        print(("Reused: " if rows else "Created: ") + table, flush=True)
        return record_id

    def inspect(self):
        csdl = self.api("GET", "$metadata")
        (ROOT / ".dataverse/metadata.xml").write_text(csdl, encoding="utf-8")
        ns = {"e": "http://docs.oasis-open.org/odata/ns/edm"}
        tree = ET.fromstring(csdl)
        names = ["pluginassembly", "plugintype", "sdkmessageprocessingstep", "sdkmessageprocessingstepimage",
            "customapi", "customapirequestparameter", "customapiresponseproperty", "environmentvariabledefinition"]
        metadata = {}
        for entity in tree.findall(".//e:EntityType", ns):
            if entity.get("Name") in names:
                metadata[entity.get("Name")] = [{"kind": p.tag.split("}")[-1], **p.attrib} for p in entity]
        (ROOT / ".dataverse/plugin-metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
        component_options = self.api("GET", "EntityDefinitions(LogicalName='solutioncomponent')/Attributes(LogicalName='componenttype')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$expand=OptionSet")
        codes = {o["Label"]["UserLocalizedLabel"]["Label"].lower(): o["Value"] for o in component_options["OptionSet"]["Options"]}
        (ROOT / ".dataverse/component-types.json").write_text(json.dumps(codes, indent=2), encoding="utf-8")
        print(json.dumps({"metadata": list(metadata), "assemblyCount": len(self.rows("pluginassembly", "name eq 'SalesDemo.Plugin'", ["pluginassemblyid"]))}))

    def status(self):
        for table in ["sdp_pipelinebatch", "sdp_salesbronze", "sdp_salessilver", "sdp_salesgold", "sdp_pipelineerror"]:
            keys = self.client.tables.get_alternate_keys(table)
            print(json.dumps({"table": table, "keys": [{"schema": k.schema_name, "columns": k.key_attributes, "status": k.status} for k in keys]}), flush=True)
        print(json.dumps({"apps": self.rows("appmodule", "uniquename eq 'sdp_salesdemo'", ["name", "uniquename"]),
            "assemblies": self.rows("pluginassembly", "name eq 'SalesDemo.Plugin'", ["name", "version"])}), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["inspect", "status"])
    args = parser.parse_args()
    getattr(DemoDataverse(), args.command)()
