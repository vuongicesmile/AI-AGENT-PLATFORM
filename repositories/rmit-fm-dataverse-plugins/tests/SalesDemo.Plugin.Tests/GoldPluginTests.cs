using System;
using System.Collections.Generic;
using System.IO;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;
using Moq;
using SalesDemo.Plugin;
using Xunit;

public sealed class GoldPluginTests
{
    private sealed class Run
    {
        public readonly Mock<IPluginExecutionContext> Context = new Mock<IPluginExecutionContext>();
        public readonly Mock<IOrganizationService> Service = new Mock<IOrganizationService>(MockBehavior.Strict);
        public readonly ParameterCollection Input = new ParameterCollection();
        public readonly ParameterCollection Output = new ParameterCollection();
        public readonly Entity Batch = new Entity("sdp_pipelinebatch", Guid.NewGuid());
        public readonly Entity Silver = new Entity("sdp_salessilver", Guid.NewGuid());
        public readonly Dictionary<string, Entity> Gold = new Dictionary<string, Entity>();
        public string Master = File.ReadAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "master-data.json"));
        public int DuplicateCount = 1;
        public readonly Mock<IServiceProvider> Provider = new Mock<IServiceProvider>();
        public Run() {
            Batch["sdp_batchkey"] = "demo01"; Batch["sdp_runkey"] = "run01"; Batch["sdp_status"] = "Calculating";
            Silver["sdp_batchkey"] = "demo01"; Silver["sdp_recordkey"] = "demo01-r0001";
            Silver["sdp_orderid"] = "SO001"; Silver["sdp_orderdate"] = new DateTime(2026, 8, 1);
            Silver["sdp_customercode"] = "C001"; Silver["sdp_productcode"] = "P001"; Silver["sdp_currency"] = "USD";
            Silver["sdp_quantity"] = 2m; Silver["sdp_unitprice"] = 1000m; Silver["sdp_discountpct"] = .05m;
            Silver["sdp_dataqualitystatus"] = "Valid";
            Input["SilverRecordId"] = Silver.Id.ToString(); Input["BatchId"] = Batch.Id.ToString(); Input["RunId"] = "run01";
            Context.SetupGet(x => x.MessageName).Returns("sdp_CalculateSalesGold");
            Context.SetupGet(x => x.InputParameters).Returns(Input);
            Context.SetupGet(x => x.OutputParameters).Returns(Output);
            Context.SetupGet(x => x.CorrelationId).Returns(Guid.NewGuid());
            var caller = Guid.NewGuid();
            Context.SetupGet(x => x.UserId).Returns(caller);
            var factory = new Mock<IOrganizationServiceFactory>(MockBehavior.Strict);
            factory.Setup(x => x.CreateOrganizationService(caller)).Returns(Service.Object);
            Provider.Setup(x => x.GetService(typeof(IPluginExecutionContext))).Returns(Context.Object);
            Provider.Setup(x => x.GetService(typeof(ITracingService))).Returns(Mock.Of<ITracingService>());
            Provider.Setup(x => x.GetService(typeof(IOrganizationServiceFactory))).Returns(factory.Object);
            Service.Setup(x => x.Retrieve("sdp_pipelinebatch", Batch.Id, It.IsAny<ColumnSet>())).Returns(Batch);
            Service.Setup(x => x.Retrieve("sdp_salessilver", Silver.Id, It.IsAny<ColumnSet>())).Returns(Silver);
            Service.Setup(x => x.RetrieveMultiple(It.IsAny<QueryBase>())).Returns((QueryBase value) => {
                var query = (QueryExpression)value;
                var result = new EntityCollection();
                if (query.EntityName == "sdp_salessilver") {
                    for (int i = 0; i < DuplicateCount; i++) result.Entities.Add(Silver);
                } else if (query.EntityName == "environmentvariabledefinition") {
                    var name = (string)query.Criteria.Conditions[0].Values[0];
                    result.Entities.Add(new Entity(query.EntityName, Guid.NewGuid()) {
                        ["defaultvalue"] = name == "sdp_DemoMasterDataJson" ? Master : name == "sdp_CategoryHigh" ? "2000" : "1000"
                    });
                }
                return result;
            });
            Service.Setup(x => x.Execute(It.IsAny<OrganizationRequest>())).Returns((OrganizationRequest value) => {
                var row = ((UpsertRequest)value).Target;
                var key = (string)row.KeyAttributes["sdp_recordkey"];
                bool created = !Gold.ContainsKey(key);
                row.Id = created ? Guid.NewGuid() : Gold[key].Id;
                Gold[key] = row;
                return new UpsertResponse { Results = new ParameterCollection {
                    ["Target"] = row.ToEntityReference(), ["RecordCreated"] = created
                }};
            });
        }
        public void Execute() => new CalculateSalesGoldPlugin().Execute(Provider.Object);
    }

    [Fact] public void Fixture_row_has_expected_metrics_and_reuses_key() {
        var run = new Run(); run.Execute();
        var gold = Assert.Single(run.Gold).Value;
        Assert.Equal(1900m, gold["sdp_netsales"]); Assert.Equal(1400m, gold["sdp_cost"]);
        Assert.Equal(500m, gold["sdp_grossprofit"]); Assert.Equal(.263158m, gold["sdp_grossmarginpct"]);
        Assert.Equal("Candidate", gold["sdp_reportstatus"]); Assert.False((bool)run.Output["IsUpdate"]);
        var id = run.Output["SalesGoldId"];
        run.Execute(); Assert.Single(run.Gold); Assert.Equal(id, run.Output["SalesGoldId"]); Assert.True((bool)run.Output["IsUpdate"]);
    }
    [Theory]
    [InlineData("sdp_batchkey", "other")]
    [InlineData("sdp_runkey", "old-run")]
    [InlineData("sdp_status", "Completed")]
    public void Batch_mismatch_is_rejected(string field, string value) {
        var run = new Run(); run.Batch[field] = value;
        Assert.Throws<InvalidPluginExecutionException>(() => run.Execute()); Assert.Empty(run.Gold);
    }
    [Theory]
    [InlineData("sdp_currency", "VND")]
    [InlineData("sdp_dataqualitystatus", "Error")]
    [InlineData("sdp_productcode", "UNKNOWN")]
    [InlineData("sdp_customercode", "UNKNOWN")]
    [InlineData("sdp_recordkey", "other-batch-r0001")]
    public void Invalid_business_input_never_writes_gold(string field, string value) {
        var run = new Run(); run.Silver[field] = value;
        Assert.Throws<InvalidPluginExecutionException>(() => run.Execute()); Assert.Empty(run.Gold);
    }
    [Fact] public void Duplicate_order_is_rejected() {
        var run = new Run { DuplicateCount = 2 };
        Assert.Throws<InvalidPluginExecutionException>(() => run.Execute()); Assert.Empty(run.Gold);
    }
    [Fact] public void Missing_cost_is_not_zero_cost() {
        var run = new Run(); run.Master = run.Master.Replace("\"costPerUnit\": 700,", "");
        Assert.Throws<InvalidPluginExecutionException>(() => run.Execute()); Assert.Empty(run.Gold);
    }
    [Fact] public void Zero_net_has_zero_margin() {
        var run = new Run(); run.Silver["sdp_discountpct"] = 1m; run.Execute();
        Assert.Equal(0m, Assert.Single(run.Gold).Value["sdp_grossmarginpct"]);
    }
}
