// Template only. Set DataverseEnvironmentUrl through approved deployment
// configuration; never hard-code a tenant or environment URL in source.
let
    Source = CommonDataService.Database(DataverseEnvironmentUrl),
    GoldUtilityDailyCost = Source{[Schema="dbo", Item="fm_gold_utilitydailycost"]}[Data],
    SelectedColumns = Table.SelectColumns(
        GoldUtilityDailyCost,
        {
            "fm_goldutilitydailycostid",
            "fm_localdate",
            "fm_campus",
            "fm_building",
            "fm_meter",
            "fm_utilitytype",
            "fm_consumption",
            "fm_unit",
            "fm_rate",
            "fm_currency",
            "fm_cost",
            "fm_validintervalcount",
            "fm_sourcerowcount",
            "fm_formulaversion",
            "fm_formulastatus",
            "fm_asofutc",
            "fm_datafreshnessminutes"
        }
    )
in
    SelectedColumns
