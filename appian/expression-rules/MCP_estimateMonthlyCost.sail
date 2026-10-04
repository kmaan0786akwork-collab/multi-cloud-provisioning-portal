/* rule!MCP_estimateMonthlyCost
   Inputs : ri!providerCode (Text), ri!vcpu (Integer), ri!ramGb (Integer),
            ri!storageGb (Integer), ri!nodes (Integer)
   Returns: Decimal — estimated monthly run-rate in USD */
a!localVariables(
  local!provider: index(
    rule!MCP_QE_getProviders(providerCode: ri!providerCode),
    1,
    null
  ),
  local!hours: cons!MCP_HOURS_PER_MONTH,          /* 730 */
  local!nodes: tointeger(a!defaultValue(ri!nodes, 0)),
  local!compute: a!defaultValue(ri!vcpu, 0) * local!nodes * local!provider.vcpuHourRate * local!hours,
  local!memory: a!defaultValue(ri!ramGb, 0) * local!nodes * local!provider.ramGbHourRate * local!hours,
  local!storage: a!defaultValue(ri!storageGb, 0) * local!nodes * cons!MCP_STORAGE_GB_MONTH_RATE, /* 0.10 */
  if(
    a!isNullOrEmpty(local!provider),
    0,
    round(local!compute + local!memory + local!storage, 2)
  )
)
