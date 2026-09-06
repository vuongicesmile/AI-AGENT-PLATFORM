using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace SalesDemo.Plugin
{
    // Schema đã đối chiếu snapshot: số tiền Decimal, trạng thái Text.
    public static class SalesRules
    {
        public static decimal Number(Entity row, string name) {
            if (!row.Contains(name) || !(row[name] is decimal value))
                throw new InvalidPluginExecutionException("Thiếu/sai kiểu Decimal: " + name);
            return value;
        }
        public static string Text(Entity row, string name) {
            var value = row.GetAttributeValue<string>(name);
            if (string.IsNullOrWhiteSpace(value)) throw new InvalidPluginExecutionException("Thiếu " + name);
            return value!.Trim();
        }
        public static void ValidateNumbers(Entity row) {
            var qty = Number(row, "sdp_quantity");
            var price = Number(row, "sdp_unitprice");
            var discount = Number(row, "sdp_discountpct");
            if (qty <= 0 || price < 0 || discount < 0 || discount > 1)
                throw new InvalidPluginExecutionException("Quantity > 0, UnitPrice >= 0, DiscountPct trong [0,1].");
        }
        public static decimal Round(decimal value, int digits = 4) => Math.Round(value, digits, MidpointRounding.AwayFromZero);
        // Current value bị trùng phải báo lỗi, không chọn ngẫu nhiên.
        public static string Configuration(IOrganizationService service, string schemaName) {
            var query = new QueryExpression("environmentvariabledefinition") { ColumnSet = new ColumnSet("defaultvalue"), TopCount = 2 };
            query.Criteria.AddCondition("schemaname", ConditionOperator.Equal, schemaName);
            var definitions = service.RetrieveMultiple(query).Entities;
            if (definitions.Count != 1) throw new InvalidPluginExecutionException("Cần đúng một cấu hình " + schemaName);
            var values = new QueryExpression("environmentvariablevalue") { ColumnSet = new ColumnSet("value"), TopCount = 2 };
            values.Criteria.AddCondition("environmentvariabledefinitionid", ConditionOperator.Equal, definitions[0].Id);
            var current = service.RetrieveMultiple(values).Entities;
            if (current.Count > 1) throw new InvalidPluginExecutionException("Cấu hình bị trùng current value: " + schemaName);
            var value = current.Count == 1 ? current[0].GetAttributeValue<string>("value") : definitions[0].GetAttributeValue<string>("defaultvalue");
            if (string.IsNullOrWhiteSpace(value)) throw new InvalidPluginExecutionException("Cấu hình rỗng: " + schemaName);
            return value!;
        }
        public static DemoMaster ParseMaster(string json) {
            try {
                using (var stream = new MemoryStream(Encoding.UTF8.GetBytes(json))) {
                    var master = (DemoMaster)new DataContractJsonSerializer(typeof(DemoMaster)).ReadObject(stream);
                    if (master.Customers == null || master.Products == null) throw new SerializationException();
                    return master;
                }
            } catch (Exception ex) when (ex is SerializationException || ex is InvalidCastException || ex is ArgumentException) {
                throw new InvalidPluginExecutionException("Master data JSON không hợp lệ.");
            }
        }
    }
    [DataContract]
    public sealed class DemoMaster
    {
        [DataMember(Name = "customers")] public List<DemoCustomer> Customers { get; set; } = new List<DemoCustomer>();
        [DataMember(Name = "products")] public List<DemoProduct> Products { get; set; } = new List<DemoProduct>();
        public DemoProduct Product(string code) {
            var found = Products.Where(x => x.Code == code && x.Active).ToArray();
            if (found.Length != 1 || found[0].Cost == null || found[0].Cost < 0)
                throw new InvalidPluginExecutionException("Không tìm được sản phẩm/giá vốn active duy nhất: " + code);
            return found[0];
        }
        public DemoCustomer Customer(string code) {
            var found = Customers.Where(x => x.Code == code && x.Active).ToArray();
            if (found.Length != 1) throw new InvalidPluginExecutionException("Không tìm được khách hàng active duy nhất: " + code);
            return found[0];
        }
    }
    [DataContract]
    public sealed class DemoCustomer
    {
        [DataMember(Name = "customerCode")] public string Code { get; set; } = "";
        [DataMember(Name = "customerName")] public string Name { get; set; } = "";
        [DataMember(Name = "isActive")] public bool Active { get; set; }
    }
    [DataContract]
    public sealed class DemoProduct
    {
        [DataMember(Name = "productCode")] public string Code { get; set; } = "";
        [DataMember(Name = "productName")] public string Name { get; set; } = "";
        [DataMember(Name = "costPerUnit")] public decimal? Cost { get; set; }
        [DataMember(Name = "isActive")] public bool Active { get; set; }
    }
}
