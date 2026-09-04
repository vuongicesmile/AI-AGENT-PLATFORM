# Plug-in Unit Tests

Cover normal, boundary, duplicate, stale, out-of-order, invalid-unit, retry, recursion/depth and idempotency cases for implemented handlers.

Use deterministic mocks/fakes and sanitized inputs. Code inspection alone is not acceptance evidence.

## Sales — CalculateSalesGold

| File | Coverage |
|---|---|
| `Sales/SalesGoldCalculatorTests.cs` | plan §9 formulas + zero NetSales margin guard + §10 category thresholds |
| `Sales/CreateSalesGoldTests.cs` | create/update idempotency, missing Silver, non-Valid Silver, unresolved cost |
| `Sales/CreateSalesGoldPluginTests.cs` | Custom API input/output parameter mapping |

```bash
dotnet test
```
