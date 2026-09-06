using System;
using Microsoft.Xrm.Sdk;
namespace SalesDemo.Plugin
{
    public sealed class ValidateSalesSilverPlugin : IPlugin
    {
        public void Execute(IServiceProvider provider) {
            var context = (IPluginExecutionContext)provider.GetService(typeof(IPluginExecutionContext));
            var trace = (ITracingService)provider.GetService(typeof(ITracingService));
            if (context.PrimaryEntityName != "sdp_salessilver" || (context.MessageName != "Create" && context.MessageName != "Update")) return;
            if (!context.InputParameters.Contains("Target") || !(context.InputParameters["Target"] is Entity target)) return;
            // [1] Target Update chỉ có cột vừa đổi: ghép với PreImage Before.
            var effective = new Entity("sdp_salessilver");
            if (context.MessageName == "Update") {
                if (!context.PreEntityImages.Contains("Before")) throw new InvalidPluginExecutionException("Thiếu PreImage Before của validation plugin.");
                foreach (var pair in context.PreEntityImages["Before"].Attributes) effective[pair.Key] = pair.Value;
            }
            foreach (var pair in target.Attributes) effective[pair.Key] = pair.Value;
            // [2] Giữ dòng Error tại Silver để điều tra nguyên nhân.
            if (effective.GetAttributeValue<string>("sdp_dataqualitystatus") != "Valid") return;
            try {
                SalesRules.ValidateNumbers(effective);
                trace.Trace("ValidateSilver passed; CorrelationId={0}", context.CorrelationId);
            } catch (InvalidPluginExecutionException ex) {
                trace.Trace("ValidateSilver rejected; CorrelationId={0}; {1}", context.CorrelationId, ex.Message);
                throw new InvalidPluginExecutionException(ex.Message + " CorrelationId=" + context.CorrelationId);
            }
        }
    }
}
