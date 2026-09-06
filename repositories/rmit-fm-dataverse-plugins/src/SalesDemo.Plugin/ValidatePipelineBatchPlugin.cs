using System;
using System.Text.RegularExpressions;
using Microsoft.Xrm.Sdk;

namespace SalesDemo.Plugin
{
    // Đồng bộ PreOperation. Form JS giúp người dùng; plugin bảo vệ cả dữ liệu gửi từ API.
    public sealed class ValidatePipelineBatchPlugin : IPlugin
    {
        public void Execute(IServiceProvider provider) {
            var context = (IPluginExecutionContext)provider.GetService(typeof(IPluginExecutionContext));
            if (context.PrimaryEntityName != "sdp_pipelinebatch" ||
                (context.MessageName != "Create" && context.MessageName != "Update")) return;
            var trace = (ITracingService)provider.GetService(typeof(ITracingService));
            try {
                var target = (Entity)context.InputParameters["Target"];
                var row = new Entity(target.LogicalName, target.Id);
                if (context.MessageName == "Update") {
                    if (!context.PreEntityImages.Contains("Before")) throw new InvalidPluginExecutionException("Thiếu PreImage Before.");
                    var before = context.PreEntityImages["Before"];
                    foreach (var field in before.Attributes) row[field.Key] = field.Value;
                    if (target.Contains("sdp_batchkey") && target.GetAttributeValue<string>("sdp_batchkey") != before.GetAttributeValue<string>("sdp_batchkey"))
                        throw new InvalidPluginExecutionException("BatchKey không được đổi sau khi tạo.");
                    var status = before.GetAttributeValue<string>("sdp_status");
                    if (status != "New" && status != "Failed") {
                        foreach (var field in new[] { "sdp_runkey", "sdp_sourceurl" })
                            if (target.Contains(field) && target.GetAttributeValue<string>(field) != before.GetAttributeValue<string>(field))
                                throw new InvalidPluginExecutionException("Chỉ đổi URL hoặc RunKey khi batch ở New/Failed.");
                    }
                }
                foreach (var field in target.Attributes) row[field.Key] = field.Value;
                foreach (var field in new[] { "sdp_batchkey", "sdp_runkey" })
                    if (SalesRules.Text(row, field) != row.GetAttributeValue<string>(field) ||
                        !Regex.IsMatch(SalesRules.Text(row, field), @"\A[A-Za-z0-9_-]{1,80}\z"))
                        throw new InvalidPluginExecutionException(field + " phải gồm 1–80 ký tự chữ, số, gạch ngang hoặc gạch dưới.");
                if (row.GetAttributeValue<string>("sdp_status") == "Requested") {
                    var url = SalesRules.Text(row, "sdp_sourceurl");
                    if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || uri.Scheme != "https" ||
                        uri.Host != "drive.google.com" || !uri.IsDefaultPort || uri.UserInfo != "" ||
                        !Regex.IsMatch(uri.AbsolutePath, @"^/file/d/[A-Za-z0-9_-]+(?:/view)?/?$"))
                        throw new InvalidPluginExecutionException("URL phải là link HTTPS chia sẻ file Google Drive.");
                }
            } catch (Exception ex) {
                trace.Trace("ValidateBatch failed; CorrelationId={0}; {1}", context.CorrelationId, ex);
                if (ex is InvalidPluginExecutionException) throw;
                throw new InvalidPluginExecutionException("Không kiểm tra được batch. CorrelationId=" + context.CorrelationId);
            }
        }
    }
}
