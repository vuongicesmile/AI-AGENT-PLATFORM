# Plug-in Project

Logic for Dataverse Custom API handlers lives here. Domain folders (for example `Sales/`) hold business calculation and orchestration; shared execution plumbing belongs under `Infrastructure/` after `pac plugin init`.

## Sales — CalculateSalesGold

| Item | Value |
|---|---|
| Custom API | `sdp_CalculateSalesGold` |
| Plugin type | `SalesDataPlugin.CreateSalesGold` |
| Plan | `plan.md` §8–10 |
| Idempotency key | `SourceSystem + OrderId` |

Classes:

- `SalesGoldCalculator` — Gross/Net/Cost/Margin formulas
- `SalesCategoryRules` — High / Medium / Low thresholds
- `CreateSalesGold` — retrieve Silver → resolve cost → calculate → upsert Gold
- `CreateSalesGoldPlugin` — Custom API parameter mapping shim

## Scaffold gate

The deployable Dataverse plug-in package must still be created with:

```bash
pac plugin init
```

after the supported target framework and signing approach are confirmed. Merge the `Sales/` types into the Pac-generated project (or reference this library from it). Do not treat the current net8.0 class library as the production sandboxed assembly until Pac packaging and registration are approved.

## Build / test (logic only)

```bash
dotnet test
```
