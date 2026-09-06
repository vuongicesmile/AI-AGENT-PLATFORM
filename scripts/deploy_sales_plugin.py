"""Deploy the reviewed Sales Demo plugin into the selected Developer solution.

Run without --apply for a read-only preflight. No credentials are copied.
Record CRUD uses Microsoft's SDK; metadata/action gaps use its auth helper.
"""
import argparse
import base64
import hashlib
import json
import time
from sales_dataverse import DemoDataverse, ROOT

TABLES = ["sdp_pipelinebatch", "sdp_salesbronze", "sdp_salessilver", "sdp_salesgold", "sdp_pipelineerror"]
ASSEMBLY = ROOT / "repositories/rmit-fm-dataverse-plugins/src/SalesDemo.Plugin/bin/Release/net48/SalesDemo.Plugin.dll"
MASTER = ROOT / "repositories/rmit-fm-integrations/demo/sales-data-pipeline/config/master-data.json"


class Deployment:
    def __init__(self):
        self.dv = DemoDataverse()
        inventory_path = ROOT / ".dataverse/flow-environments.json"
        if time.time() - inventory_path.stat().st_mtime > 3600:
            raise RuntimeError("Refresh FlowAgent environment inventory before deployment (max age 1 hour)")
        inventory = json.loads(inventory_path.read_text(encoding="utf-8"))
        environments = json.loads(inventory["content"][0]["text"])
        selected = [e for e in environments if e["name"] == self.dv.connection["environmentId"]]
        if len(selected) != 1 or selected[0]["environmentSku"] != "Developer":
            raise RuntimeError("Expected selected Developer environment")
        options = self.dv.api("GET", "EntityDefinitions(LogicalName='solutioncomponent')/Attributes(LogicalName='componenttype')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$expand=OptionSet")
        self.codes = {o["Label"]["UserLocalizedLabel"]["Label"].lower(): o["Value"] for o in options["OptionSet"]["Options"]}
        (ROOT / ".dataverse/component-types.json").write_text(json.dumps(self.codes, indent=2), encoding="utf-8")
        self.receipt = {"solution": self.dv.solution, "keys": {}, "types": {}, "steps": []}

    def code(self, label):
        if label.lower() not in self.codes:
            raise RuntimeError("Unsupported component type: " + label)
        return self.codes[label.lower()]

    def save_receipt(self):
        (ROOT / ".dataverse/plugin-deployment.json").write_text(json.dumps(self.receipt, indent=2), encoding="utf-8")

    def ensure_api_component(self, table, filter, data):
        # Python SDK record CRUD lacks SolutionUniqueName/header injection. New
        # Custom API component codes are not in the componenttype choice either.
        # Use the documented solution-scoped Web API create/update for these
        # three metadata tables; verify membership via normal SDK reads.
        if table not in {"customapi", "customapirequestparameter", "customapiresponseproperty"}:
            raise ValueError("Unsupported solution-scoped metadata table")
        key = table + "id"
        matches = self.dv.rows(table, filter, [key, "name"], top=2)
        if len(matches) > 1:
            raise RuntimeError("Ambiguous Custom API component")
        entity_set = table + "s"
        if matches:
            record_id = matches[0][key]
            self.dv.api("PATCH", f"{entity_set}({record_id})", {"name": matches[0]["name"]})
        else:
            created = self.dv.api("POST", entity_set, data, representation=True)
            record_id = created[key]
        members = self.dv.rows("solutioncomponent", f"_solutionid_value eq {self.dv.connection['solutionId']} and objectid eq {record_id}", ["componenttype"], top=2)
        if not members:
            raise RuntimeError("Custom API component was not added to selected solution: " + table)
        print("Solution-scoped component: " + table, flush=True)
        return record_id

    def metadata(self):
        for table in TABLES:
            column = "sdp_batchkey" if table == "sdp_pipelinebatch" else "sdp_recordkey"
            keys = [k for k in self.dv.client.tables.get_alternate_keys(table) if k.key_attributes == [column]]
            if not keys:
                self.dv.client.tables.create_alternate_key(table, "sdp_" + table[4:] + "_key", [column])
            for attempt in range(24):
                keys = [k for k in self.dv.client.tables.get_alternate_keys(table) if k.key_attributes == [column]]
                if keys and keys[0].status == "Active":
                    break
                if keys and keys[0].status == "Failed":
                    raise RuntimeError("Key failed; inspect duplicates: " + table)
                print("Waiting for key: " + table, flush=True)
                time.sleep(5)
            else:
                raise RuntimeError("Key still pending: " + table)
            self.dv.add_component(keys[0].metadata_id, self.code("Entity Key"))
            self.receipt["keys"][table] = {"id": keys[0].metadata_id, "status": keys[0].status}
            self.save_receipt()
            print("Active key: " + table, flush=True)
        attr_path = "EntityDefinitions(LogicalName='sdp_salesgold')/Attributes(LogicalName='sdp_grossmarginpct')/Microsoft.Dynamics.CRM.DecimalAttributeMetadata"
        attr = self.dv.api("GET", attr_path)
        if attr["Precision"] < 6:
            attr = {k: v for k, v in attr.items() if not k.startswith("@odata.")}
            attr.update({"Precision": 6, "@odata.type": "Microsoft.Dynamics.CRM.DecimalAttributeMetadata"})
            self.dv.api("PUT", attr_path, attr)
            self.dv.api("POST", "PublishXml", {"ParameterXml": "<importexportxml><entities><entity>sdp_salesgold</entity></entities></importexportxml>"})
        master = json.dumps(json.loads(MASTER.read_text(encoding="utf-8")), ensure_ascii=False, separators=(",", ":"))
        for name, value in {"sdp_DemoMasterDataJson": master, "sdp_CategoryHigh": "2000", "sdp_CategoryMedium": "1000", "sdp_BatchConsolePageName": ""}.items():
            self.dv.ensure("environmentvariabledefinition", f"schemaname eq '{name}'", {
                "schemaname": name, "displayname": name, "type": 100000000, "defaultvalue": value,
                "description": "Sales Demo configuration; keep stable while processing a batch."}, self.code("Environment Variable Definition"))

    def register(self):
        content = ASSEMBLY.read_bytes()
        info = json.loads((ROOT / ".dataverse/plugin-assembly-info.json").read_text(encoding="utf-8-sig"))
        self.receipt["assemblySha256"] = hashlib.sha256(content).hexdigest()
        data = {"name": info["name"], "version": info["version"], "culture": info["culture"],
            "publickeytoken": info["publicKeyToken"], "isolationmode": 2, "sourcetype": 0,
            "content": base64.b64encode(content).decode("ascii")}
        assemblies = self.dv.rows("pluginassembly", "name eq 'SalesDemo.Plugin'", ["pluginassemblyid", "publickeytoken", "version"])
        if assemblies:
            if len(assemblies) != 1 or assemblies[0]["publickeytoken"] != info["publicKeyToken"] or assemblies[0]["version"] != info["version"]:
                raise RuntimeError("Existing assembly identity/version differs; review before updating")
            assembly_id = assemblies[0]["pluginassemblyid"]
            self.dv.client.records.update("pluginassembly", assembly_id, {"content": data["content"]})
            self.dv.add_component(assembly_id, self.code("Plugin Assembly"))
        else:
            assembly_id = self.dv.ensure("pluginassembly", "name eq 'SalesDemo.Plugin'", data, self.code("Plugin Assembly"))
        self.receipt["assemblyId"] = assembly_id
        self.save_receipt()
        for name in ["ValidatePipelineBatchPlugin", "ValidateSalesSilverPlugin", "CalculateSalesGoldPlugin"]:
            typename = "SalesDemo.Plugin." + name
            self.receipt["types"][name] = self.dv.ensure("plugintype", f"typename eq '{typename}' and _pluginassemblyid_value eq {assembly_id}", {
                "typename": typename, "name": typename, "friendlyname": name,
                "pluginassemblyid@odata.bind": f"/pluginassemblies({assembly_id})"}, self.code("Plugin Type"))
            self.save_receipt()
        for table, name, fields in [
            ("sdp_pipelinebatch", "ValidatePipelineBatchPlugin", "sdp_batchkey,sdp_runkey,sdp_status,sdp_sourceurl"),
            ("sdp_salessilver", "ValidateSalesSilverPlugin", "sdp_quantity,sdp_unitprice,sdp_discountpct,sdp_dataqualitystatus")]:
            for message in ["Create", "Update"]:
                messages = self.dv.rows("sdkmessage", f"name eq '{message}'", ["sdkmessageid"], top=2)
                if len(messages) != 1:
                    raise RuntimeError("Ambiguous SDK message")
                mid = messages[0]["sdkmessageid"]
                filters = self.dv.rows("sdkmessagefilter", f"_sdkmessageid_value eq {mid} and primaryobjecttypecode eq '{table}'", ["sdkmessagefilterid"], top=2)
                if len(filters) != 1:
                    raise RuntimeError("Ambiguous SDK filter for " + table)
                step_name = f"SalesDemo: {name}: {message}"
                data = {"name": step_name, "stage": 20, "mode": 0, "rank": 10, "supporteddeployment": 0,
                    "sdkmessageid@odata.bind": f"/sdkmessages({mid})",
                    "sdkmessagefilterid@odata.bind": f"/sdkmessagefilters({filters[0]['sdkmessagefilterid']})",
                    "eventhandler_plugintype@odata.bind": f"/plugintypes({self.receipt['types'][name]})"}
                if message == "Update":
                    data["filteringattributes"] = fields
                step_id = self.dv.ensure("sdkmessageprocessingstep", f"name eq '{step_name}'", data, self.code("SDK Message Processing Step"))
                self.receipt["steps"].append(step_id)
                self.save_receipt()
                if message == "Update":
                    self.dv.ensure("sdkmessageprocessingstepimage", f"_sdkmessageprocessingstepid_value eq {step_id} and name eq 'Before'", {
                        "name": "Before", "entityalias": "Before", "imagetype": 0, "messagepropertyname": "Target", "attributes": fields,
                        "sdkmessageprocessingstepid@odata.bind": f"/sdkmessageprocessingsteps({step_id})"}, self.code("SDK Message Processing Step Image"))
        api_name = "sdp_CalculateSalesGold"
        api_id = self.ensure_api_component("customapi", f"uniquename eq '{api_name}'", {
            "uniquename": api_name, "name": api_name, "displayname": "SDP Calculate Sales Gold",
            "description": "Calculate one Gold row with Batch/Run validation and idempotent upsert.",
            "bindingtype": 0, "allowedcustomprocessingsteptype": 0, "isfunction": False, "isprivate": False,
            "workflowsdkstepenabled": True, "PluginTypeId@odata.bind": f"/plugintypes({self.receipt['types']['CalculateSalesGoldPlugin']})"})
        self.receipt["customApiId"] = api_id
        for table, parameters, label in [
            ("customapirequestparameter", {"SilverRecordId": 10, "BatchId": 10, "RunId": 10}, "Custom API Request Parameter"),
            ("customapiresponseproperty", {"SalesGoldId": 10, "IsUpdate": 0, "ErrorMessage": 10}, "Custom API Response Property")]:
            for name, kind in parameters.items():
                data = {"uniquename": name, "name": api_name + "." + name, "displayname": name,
                    "type": kind, "CustomAPIId@odata.bind": f"/customapis({api_id})"}
                if table == "customapirequestparameter":
                    data["isoptional"] = False
                self.ensure_api_component(table, f"_customapiid_value eq {api_id} and uniquename eq '{name}'", data)
        self.receipt["registered"] = True
        self.save_receipt()
        print("Plugin and API registered. Live smoke test remains required.", flush=True)

    def plan(self):
        labels = ["Entity Key", "Plugin Assembly", "Plugin Type", "SDK Message Processing Step", "SDK Message Processing Step Image",
            "Environment Variable Definition"]
        print(json.dumps({"developerConfirmed": True, "componentCodes": {x: self.code(x) for x in labels},
            "assemblyExistsLocally": ASSEMBLY.is_file(), "plan": ["5 alternate keys, wait Active", "Gold margin precision 6",
            "4 environment variable definitions", "Signed sandbox assembly, 3 plugin types", "4 sync PreOperation steps, 2 PreImages",
            "Unbound Custom API, 3 inputs, 3 outputs"]}, indent=2), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    deployment = Deployment()
    deployment.plan()
    if args.apply:
        deployment.metadata()
        deployment.register()
