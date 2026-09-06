using System;
using System.Globalization;
using System.Text.RegularExpressions;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;
namespace SalesDemo.Plugin
{
    public sealed class CalculateSalesGoldPlugin : IPlugin
    {
        public void Execute(IServiceProvider provider) {
            var context = (IPluginExecutionContext)provider.GetService(typeof(IPluginExecutionContext));
            var trace = (ITracingService)provider.GetService(typeof(ITracingService));
            if (context.MessageName != "sdp_CalculateSalesGold") throw new InvalidPluginExecutionException("Plugin này chỉ phục vụ sdp_CalculateSalesGold.");
            var factory = (IOrganizationServiceFactory)provider.GetService(typeof(IOrganizationServiceFactory));
            var service = factory.CreateOrganizationService(context.UserId);
            try {
                var silverId = GuidInput(context, "SilverRecordId");
                var batchId = GuidInput(context, "BatchId");
                var runId = StringInput(context, "RunId");
                var batch = service.Retrieve("sdp_pipelinebatch", batchId, new ColumnSet("sdp_batchkey", "sdp_runkey", "sdp_status"));
                var silver = service.Retrieve("sdp_salessilver", silverId, new ColumnSet(
                    "sdp_batchkey", "sdp_recordkey", "sdp_name", "sdp_orderid", "sdp_orderdate", "sdp_customercode",
                    "sdp_productcode", "sdp_currency", "sdp_quantity", "sdp_unitprice", "sdp_discountpct", "sdp_dataqualitystatus"));
                var batchKey = SalesRules.Text(batch, "sdp_batchkey");
                var key = SalesRules.Text(silver, "sdp_recordkey");
                if (!Regex.IsMatch(key, "^" + Regex.Escape(batchKey) + @"-r[0-9]{4}$"))
                    throw new InvalidPluginExecutionException("RecordKey không thuộc batch hiện tại.");
                // [1] Không tính nhầm batch hoặc lần chạy đã hết hiệu lực.
                if (SalesRules.Text(silver, "sdp_batchkey") != batchKey || SalesRules.Text(batch, "sdp_runkey") != runId ||
                    batch.GetAttributeValue<string>("sdp_status") != "Calculating")
                    throw new InvalidPluginExecutionException("Batch/RunId không khớp hoặc batch chưa ở Calculating.");
                if (silver.GetAttributeValue<string>("sdp_dataqualitystatus") != "Valid") throw new InvalidPluginExecutionException("Chỉ tính Gold từ Silver Valid.");
                SalesRules.ValidateNumbers(silver);
                if (SalesRules.Text(silver, "sdp_currency") != "USD") throw new InvalidPluginExecutionException("Fixture demo chỉ hỗ trợ USD.");
                var order = SalesRules.Text(silver, "sdp_orderid");
                if (!silver.Contains("sdp_orderdate") || !(silver["sdp_orderdate"] is DateTime date)) throw new InvalidPluginExecutionException("Thiếu ngày đơn hàng.");
                // [2] Kiểm tra OrderId trùng, không chỉ tin nhãn Valid.
                var duplicates = new QueryExpression("sdp_salessilver") { ColumnSet = new ColumnSet(false), TopCount = 2 };
                duplicates.Criteria.AddCondition("sdp_batchkey", ConditionOperator.Equal, batchKey);
                duplicates.Criteria.AddCondition("sdp_orderid", ConditionOperator.Equal, order);
                if (service.RetrieveMultiple(duplicates).Entities.Count != 1) throw new InvalidPluginExecutionException("OrderId phải duy nhất trong batch.");
                var master = SalesRules.ParseMaster(SalesRules.Configuration(service, "sdp_DemoMasterDataJson"));
                var product = master.Product(SalesRules.Text(silver, "sdp_productcode"));
                var customer = master.Customer(SalesRules.Text(silver, "sdp_customercode"));
                var high = Threshold(service, "sdp_CategoryHigh");
                var medium = Threshold(service, "sdp_CategoryMedium");
                if (high < medium || medium < 0) throw new InvalidPluginExecutionException("Ngưỡng category không hợp lệ.");
                var qty = SalesRules.Number(silver, "sdp_quantity");
                var gross = SalesRules.Round(qty * SalesRules.Number(silver, "sdp_unitprice"));
                var discount = SalesRules.Round(gross * SalesRules.Number(silver, "sdp_discountpct"));
                var net = SalesRules.Round(gross - discount);
                var cost = SalesRules.Round(qty * product.Cost!.Value);
                var profit = SalesRules.Round(net - cost);
                var gold = new Entity("sdp_salesgold");
                gold.KeyAttributes["sdp_recordkey"] = key;
                gold["sdp_name"] = order; gold["sdp_batchkey"] = batchKey;
                gold["sdp_orderid"] = order; gold["sdp_orderdate"] = date.Date;
                gold["sdp_year"] = date.Year; gold["sdp_month"] = date.Month;
                gold["sdp_customercode"] = customer.Code; gold["sdp_customername"] = customer.Name;
                gold["sdp_productcode"] = product.Code; gold["sdp_productname"] = product.Name;
                gold["sdp_currency"] = "USD";
                gold["sdp_grosssales"] = gross; gold["sdp_discountamount"] = discount; gold["sdp_netsales"] = net;
                gold["sdp_cost"] = cost; gold["sdp_grossprofit"] = profit;
                gold["sdp_grossmarginpct"] = net == 0 ? 0m : SalesRules.Round(profit / net, 6);
                gold["sdp_salescategory"] = net >= high ? "High" : net >= medium ? "Medium" : "Low";
                gold["sdp_reportstatus"] = "Candidate";
                // [3] Unique key bảo vệ việc thử lại; không dùng Create mù.
                var result = (UpsertResponse)service.Execute(new UpsertRequest { Target = gold });
                context.OutputParameters["SalesGoldId"] = result.Target.Id.ToString();
                context.OutputParameters["IsUpdate"] = !result.RecordCreated;
                context.OutputParameters["ErrorMessage"] = "";
                trace.Trace("CalculateGold passed; Batch={0}; Run={1}; Row={2}; CorrelationId={3}", batchKey, runId, key, context.CorrelationId);
            } catch (Exception ex) {
                trace.Trace("CalculateGold failed; CorrelationId={0}; {1}", context.CorrelationId, ex);
                var message = ex is InvalidPluginExecutionException ? ex.Message : "Không tính được Gold; kiểm tra Plugin Trace Log.";
                throw new InvalidPluginExecutionException(message + " CorrelationId=" + context.CorrelationId);
            }
        }
        private static string StringInput(IPluginExecutionContext context, string name) {
            if (!context.InputParameters.Contains(name) || !(context.InputParameters[name] is string value) || string.IsNullOrWhiteSpace(value))
                throw new InvalidPluginExecutionException("Thiếu tham số " + name);
            return value.Trim();
        }
        private static Guid GuidInput(IPluginExecutionContext context, string name) {
            if (!Guid.TryParse(StringInput(context, name), out var value) || value == Guid.Empty) throw new InvalidPluginExecutionException("GUID không hợp lệ: " + name);
            return value;
        }
        private static decimal Threshold(IOrganizationService service, string name) {
            if (!decimal.TryParse(SalesRules.Configuration(service, name), NumberStyles.Number, CultureInfo.InvariantCulture, out var value))
                throw new InvalidPluginExecutionException("Cấu hình số không hợp lệ: " + name);
            return value;
        }
    }
}
