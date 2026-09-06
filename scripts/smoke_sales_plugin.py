"""Live, synthetic one-row plugin test; this is not the full ingestion pipeline.

Leaves test records for inspection. Run only against the same Developer target
validated by deployment. No production rows are selected or changed.
"""
import argparse
import json
from decimal import Decimal
import uuid
from sales_dataverse import DemoDataverse, ROOT


def expect_rejected(operation, fragment):
    try:
        operation()
    except Exception as error:
        if fragment not in str(error):
            raise RuntimeError("Unexpected failure instead of validation: " + str(error)) from error
        return True
    raise AssertionError("Invalid operation unexpectedly succeeded: " + fragment)


def main(keep_calculating):
    # Reuse the live Developer/solution guard without making metadata changes.
    from deploy_sales_plugin import Deployment
    deployment = Deployment()
    dv = deployment.dv
    receipt = json.loads((ROOT / ".dataverse/plugin-deployment.json").read_text(encoding="utf-8"))
    if not receipt.get("registered"):
        raise RuntimeError("Register the complete plugin/API contract first")
    batch_key, run_key = "plugin-test-" + uuid.uuid4().hex, "run-" + uuid.uuid4().hex
    record_key = batch_key + "-r0001"
    batch_id = dv.client.records.create("sdp_pipelinebatch", {
        "sdp_name": "TEST Plugin SO001 (direct SDK)", "sdp_batchkey": batch_key,
        "sdp_runkey": run_key, "sdp_status": "New"})
    result = {"testKind": "Direct SDK plugin test, not ingestion pipeline", "batchId": batch_id,
        "batchKey": batch_key, "runId": run_key, "checks": {}}
    output = ROOT / ".dataverse/plugin-smoke-test.json"

    def save():
        output.write_text(json.dumps(result, indent=2), encoding="utf-8")

    save()
    try:
        result["checks"]["invalidRequestedUrlRejected"] = expect_rejected(lambda: dv.client.records.update("sdp_pipelinebatch", batch_id,
            {"sdp_status": "Requested", "sdp_sourceurl": "https://drive.google.com.evil.example/file/d/fake/view"}), "URL")
        result["checks"]["immutableBatchKey"] = expect_rejected(lambda: dv.client.records.update("sdp_pipelinebatch", batch_id,
            {"sdp_batchkey": "other-batch"}), "BatchKey")
        dv.client.records.update("sdp_pipelinebatch", batch_id, {"sdp_status": "Calculating"})
        silver_id = dv.client.records.create("sdp_salessilver", {
            "sdp_name": "TEST SO001", "sdp_batchkey": batch_key, "sdp_recordkey": record_key,
            "sdp_orderid": "SO001", "sdp_orderdate": "2026-08-01T00:00:00Z", "sdp_customercode": "C001",
            "sdp_productcode": "P001", "sdp_currency": "USD", "sdp_quantity": 2,
            "sdp_unitprice": 1000, "sdp_discountpct": 0.05, "sdp_dataqualitystatus": "Valid"})
        result["silverId"] = silver_id
        request = {"SilverRecordId": silver_id, "BatchId": batch_id, "RunId": run_key}
        result["request"] = request
        save()
        result["checks"]["invalidSilverQuantityRejected"] = expect_rejected(lambda: dv.client.records.update("sdp_salessilver", silver_id,
            {"sdp_quantity": -1}), "Quantity")
        silver = dv.client.records.retrieve("sdp_salessilver", silver_id)
        assert Decimal(str(silver["sdp_quantity"])) == Decimal(2), "Rejected update changed Silver"
        first = dv.api("POST", "sdp_CalculateSalesGold", request)
        second = dv.api("POST", "sdp_CalculateSalesGold", request)
        assert first["IsUpdate"] is False and second["IsUpdate"] is True
        assert first["SalesGoldId"] == second["SalesGoldId"]
        result["goldId"] = first["SalesGoldId"]
        gold = dv.rows("sdp_salesgold", f"sdp_batchkey eq '{batch_key}'", ["sdp_salesgoldid", "sdp_netsales", "sdp_cost",
            "sdp_grossprofit", "sdp_grossmarginpct", "sdp_reportstatus", "sdp_recordkey"], top=2)
        assert len(gold) == 1 and gold[0]["sdp_recordkey"] == record_key
        for field, expected in {"sdp_netsales": "1900", "sdp_cost": "1400", "sdp_grossprofit": "500", "sdp_grossmarginpct": "0.263158"}.items():
            assert Decimal(str(gold[0][field])) == Decimal(expected), field
        assert gold[0]["sdp_reportstatus"] == "Candidate"
        result["checks"].update(metrics=True, retrySameGoldId=True, goldCountOne=True, candidateOnly=True)
        result["checks"]["staleRunRejected"] = expect_rejected(lambda: dv.api("POST", "sdp_CalculateSalesGold",
            {**request, "RunId": "stale-run"}), "Batch/RunId")
        result["passed"] = True
        print(json.dumps({"passed": True, "checks": result["checks"], "metrics": {
            "netSales": 1900, "cost": 1400, "grossProfit": 500, "grossMarginPct": 0.263158}}, indent=2), flush=True)
    except Exception as error:
        result.update(passed=False, error=str(error))
        raise
    finally:
        save()
        # This synthetic test has no Bronze/Dataflow reconciliation; do not mark Completed.
        if not keep_calculating or not result.get("passed"):
            dv.client.records.update("sdp_pipelinebatch", batch_id, {"sdp_status": "New"})


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--keep-calculating", action="store_true", help="Leave ready for the next manual flow test")
    main(parser.parse_args().keep_calculating)
