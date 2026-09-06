#nullable enable
using System;
using Microsoft.Xrm.Sdk;
using Moq;
using SalesDemo.Plugin;
using Xunit;

public sealed class BatchValidationTests
{
    private static Entity Batch(string status = "New") => new Entity("sdp_pipelinebatch") {
        ["sdp_batchkey"] = "test01", ["sdp_runkey"] = "run01", ["sdp_status"] = status,
        ["sdp_sourceurl"] = "https://drive.google.com/file/d/demo_file-01/view?usp=sharing"
    };
    private static void Execute(Entity target, Entity? before = null, bool update = false) {
        var context = new Mock<IPluginExecutionContext>();
        context.SetupGet(x => x.MessageName).Returns(update ? "Update" : "Create");
        context.SetupGet(x => x.PrimaryEntityName).Returns("sdp_pipelinebatch");
        context.SetupGet(x => x.InputParameters).Returns(new ParameterCollection { ["Target"] = target });
        var images = new EntityImageCollection();
        if (before != null) images["Before"] = before;
        context.SetupGet(x => x.PreEntityImages).Returns(images);
        var provider = new Mock<IServiceProvider>();
        provider.Setup(x => x.GetService(typeof(IPluginExecutionContext))).Returns(context.Object);
        provider.Setup(x => x.GetService(typeof(ITracingService))).Returns(Mock.Of<ITracingService>());
        new ValidatePipelineBatchPlugin().Execute(provider.Object);
    }
    [Theory]
    [InlineData("https://drive.google.com/file/d/demo01/view", true)]
    [InlineData("https://drive.google.com/file/d/demo01?usp=sharing", true)]
    [InlineData("https://drive.google.com.evil.example/file/d/demo01/view", false)]
    [InlineData("https://drive.google.com@evil.example/file/d/demo01/view", false)]
    [InlineData("https://user@drive.google.com/file/d/demo01/view", false)]
    [InlineData("http://drive.google.com/file/d/demo01/view", false)]
    [InlineData("https://drive.google.com:444/file/d/demo01/view", false)]
    [InlineData("https://drive.google.com/drive/folders/demo01", false)]
    [InlineData("", false)]
    public void Requested_checks_Drive_file_URL(string url, bool valid) {
        var row = Batch("Requested"); row["sdp_sourceurl"] = url;
        var error = Record.Exception(() => Execute(row));
        if (valid) Assert.Null(error); else Assert.IsType<InvalidPluginExecutionException>(error);
    }
    [Theory]
    [InlineData("sdp_batchkey", "other", "New", false)]
    [InlineData("sdp_batchkey", "test01", "Processing", true)]
    [InlineData("sdp_runkey", "run02", "Processing", false)]
    [InlineData("sdp_runkey", "run02", "Failed", true)]
    [InlineData("sdp_sourceurl", "https://drive.google.com/file/d/other/view", "Calculating", false)]
    [InlineData("sdp_status", "Requested", "New", true)]
    public void Update_uses_preimage(string field, string value, string status, bool allowed) {
        var change = new Entity("sdp_pipelinebatch") { [field] = value };
        var error = Record.Exception(() => Execute(change, Batch(status), true));
        if (allowed) Assert.Null(error); else Assert.IsType<InvalidPluginExecutionException>(error);
    }
    [Theory]
    [InlineData(" ")]
    [InlineData(" test01 ")]
    [InlineData("test01\n")]
    [InlineData("test/01")]
    public void Keys_must_be_canonical(string key) {
        var row = Batch(); row["sdp_batchkey"] = key;
        Assert.Throws<InvalidPluginExecutionException>(() => Execute(row));
    }
    [Fact] public void Draft_can_be_saved_without_URL() {
        var row = Batch(); row.Attributes.Remove("sdp_sourceurl"); Execute(row);
    }
    [Fact] public void Update_requires_preimage() =>
        Assert.Throws<InvalidPluginExecutionException>(() => Execute(new Entity("sdp_pipelinebatch"), update: true));
}
