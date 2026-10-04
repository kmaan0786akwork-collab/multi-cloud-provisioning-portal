/* interface!MCP_ClusterHealthDashboard
   Role-based SAIL dashboard: KPI cards + live cluster health tiles.
   Visible to all MCP groups; data scoped by group membership. */
a!localVariables(
  local!isAdmin: a!isUserMemberOfGroup(loggedInUser(), cons!MCP_GRP_ADMINISTRATORS),
  local!isGov: a!isUserMemberOfGroup(loggedInUser(), cons!MCP_GRP_L2_APPROVERS),
  local!myTeams: rule!MCP_QE_getTeamsForUser(username: loggedInUser()).teamId,
  /* refresh every 30s so cluster telemetry stays current */
  local!assets: a!refreshVariable(
    value: a!queryRecordType(
      recordType: recordType!MCP Cloud Asset,
      filters: {
        a!queryFilter(field: recordType!MCP Cloud Asset.fields.assetStatus, operator: "in", value: {"RUNNING", "DEGRADED"}),
        a!queryFilter(field: recordType!MCP Cloud Asset.fields.teamId, operator: "in", value: local!myTeams,
          applyWhen: not(or(local!isAdmin, local!isGov)))
      },
      pagingInfo: a!pagingInfo(1, 50, a!sortInfo(recordType!MCP Cloud Asset.fields.cpuUtilPct, false))
    ).data,
    refreshInterval: 0.5
  ),
  local!degraded: index(local!assets, wherecontains("DEGRADED", touniformstring(local!assets[recordType!MCP Cloud Asset.fields.assetStatus])), {}),
  {
    a!columnsLayout(
      columns: {
        a!columnLayout(contents: rule!MCP_KpiCard(label: "Active environments", value: length(local!assets), subtext: length(local!degraded) & " degraded")),
        a!columnLayout(contents: rule!MCP_KpiCard(label: "Pending approvals", value: count(rule!MCP_QE_getPendingApprovals().approvalId), subtext: "User input tasks")),
        a!columnLayout(contents: rule!MCP_KpiCard(label: "Monthly run-rate", value: dollar(sum(rule!MCP_QE_getTeamUtilization(teamIds: local!myTeams).monthlySpend)), subtext: "Committed")),
        a!columnLayout(contents: rule!MCP_KpiCard(label: "Expiring ≤ 7 days", value: count(rule!MCP_QE_getExpiringAssets(days: 7).assetId), subtext: "Non-PROD TTL"))
      },
      stackWhen: {"PHONE", "TABLET_PORTRAIT"}
    ),
    a!sectionLayout(
      label: "Cluster health",
      contents: a!cardGroupLayout(
        cardWidth: "MEDIUM",
        cards: a!forEach(
          items: local!assets,
          expression: a!cardLayout(
            link: a!recordLink(recordType: recordType!MCP Cloud Asset, identifier: fv!item[recordType!MCP Cloud Asset.fields.assetId]),
            style: if(fv!item[recordType!MCP Cloud Asset.fields.assetStatus] = "DEGRADED", "WARN", "NONE"),
            showBorder: true,
            contents: {
              a!richTextDisplayField(
                value: {
                  a!richTextItem(text: fv!item[recordType!MCP Cloud Asset.fields.clusterName], style: "STRONG"),
                  char(10),
                  rule!MCP_StatusTag(status: fv!item[recordType!MCP Cloud Asset.fields.assetStatus]),
                  "  " & fv!item[recordType!MCP Cloud Asset.fields.providerCode] & " · " & fv!item[recordType!MCP Cloud Asset.fields.regionCode]
                }
              ),
              a!progressBarField(label: "CPU", percentage: fv!item[recordType!MCP Cloud Asset.fields.cpuUtilPct],
                color: if(fv!item[recordType!MCP Cloud Asset.fields.cpuUtilPct] > 88, "ERROR", "POSITIVE"), labelPosition: "ADJACENT"),
              a!progressBarField(label: "Memory", percentage: fv!item[recordType!MCP Cloud Asset.fields.memUtilPct],
                color: if(fv!item[recordType!MCP Cloud Asset.fields.memUtilPct] > 90, "ERROR", "POSITIVE"), labelPosition: "ADJACENT")
            }
          )
        )
      )
    )
  }
)
