using System;
using Microsoft.Xrm.Sdk;
using Moq;
using SalesDemo.Plugin;
using Xunit;

public sealed class ValidationTests
{
    [Theory]
    [InlineData("Valid", -1, true)]
    [InlineData("Error", -1, false)]
    [InlineData("Valid", 2, false)]
    public void Partial_update_uses_preimage_and_preserves_error_rows(string quality, int qty, bool rejected) {
        var context = new Mock<IPluginExecutionContext>();
        context.SetupGet(x => x.MessageName).Returns("Update");
        context.SetupGet(x => x.PrimaryEntityName).Returns("sdp_salessilver");
        context.SetupGet(x => x.InputParameters).Returns(new ParameterCollection {
            ["Target"] = new Entity("sdp_salessilver") { ["sdp_quantity"] = (decimal)qty }
        });
        context.SetupGet(x => x.PreEntityImages).Returns(new EntityImageCollection {
            ["Before"] = new Entity("sdp_salessilver") {
                ["sdp_quantity"] = 1m, ["sdp_unitprice"] = 1000m, ["sdp_discountpct"] = .05m, ["sdp_dataqualitystatus"] = quality
            }
        });
        var provider = new Mock<IServiceProvider>();
        provider.Setup(x => x.GetService(typeof(IPluginExecutionContext))).Returns(context.Object);
        provider.Setup(x => x.GetService(typeof(ITracingService))).Returns(Mock.Of<ITracingService>());
        var error = Record.Exception(() => new ValidateSalesSilverPlugin().Execute(provider.Object));
        if (rejected) Assert.IsType<InvalidPluginExecutionException>(error); else Assert.Null(error);
    }
}
