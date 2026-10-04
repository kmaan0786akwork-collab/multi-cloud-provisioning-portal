/* rule!MCP_getTeamUtilization
   Inputs : ri!teamId (Text), ri!excludeRequestId (Integer, optional)
   Returns: Map(vcpu, ramGb, storageGb, spend, count)
   Sums the committed footprint (APPROVED / PROVISIONING / ACTIVE) for a team. */
a!localVariables(
  local!requests: a!queryRecordType(
    recordType: recordType!MCP Environment Request,
    fields: {
      recordType!MCP Environment Request.fields.requestId,
      recordType!MCP Environment Request.fields.vcpuPerNode,
      recordType!MCP Environment Request.fields.ramGbPerNode,
      recordType!MCP Environment Request.fields.storageGbPerNode,
      recordType!MCP Environment Request.fields.nodeCount,
      recordType!MCP Environment Request.fields.estMonthlyCost
    },
    filters: a!queryLogicalExpression(
      operator: "AND",
      filters: {
        a!queryFilter(field: recordType!MCP Environment Request.fields.teamId, operator: "=", value: ri!teamId),
        a!queryFilter(field: recordType!MCP Environment Request.fields.statusCode, operator: "in", value: cons!MCP_COMMITTED_STATUSES),
        a!queryFilter(field: recordType!MCP Environment Request.fields.requestId, operator: "<>", value: ri!excludeRequestId, applyWhen: a!isNotNullOrEmpty(ri!excludeRequestId))
      }
    ),
    pagingInfo: a!pagingInfo(startIndex: 1, batchSize: 500)
  ).data,
  local!vcpuTotals: a!forEach(
    items: local!requests,
    expression: fv!item[recordType!MCP Environment Request.fields.vcpuPerNode] * fv!item[recordType!MCP Environment Request.fields.nodeCount]
  ),
  local!ramTotals: a!forEach(
    items: local!requests,
    expression: fv!item[recordType!MCP Environment Request.fields.ramGbPerNode] * fv!item[recordType!MCP Environment Request.fields.nodeCount]
  ),
  local!storageTotals: a!forEach(
    items: local!requests,
    expression: fv!item[recordType!MCP Environment Request.fields.storageGbPerNode] * fv!item[recordType!MCP Environment Request.fields.nodeCount]
  ),
  a!map(
    vcpu: sum(local!vcpuTotals),
    ramGb: sum(local!ramTotals),
    storageGb: sum(local!storageTotals),
    spend: sum(local!requests[recordType!MCP Environment Request.fields.estMonthlyCost]),
    count: length(local!requests)
  )
)
