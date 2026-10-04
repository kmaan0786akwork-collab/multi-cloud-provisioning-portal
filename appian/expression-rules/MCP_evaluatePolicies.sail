/* rule!MCP_evaluatePolicies
   Inputs : ri!request (CDT: MCP_EnvRequest)
   Returns: List of MCP_PolicyResult (severity PASS | WARN | BLOCK)
   Validates a request configuration against infrastructure policy POL-001 … POL-010.
   Array-filtering is used throughout so new policies can be added as list items. */
a!localVariables(
  local!r: ri!request,
  local!isProd: local!r.envType = "PROD",
  local!regions: rule!MCP_QE_getRegions(providerCode: local!r.providerCode),
  /* array filter: regions where PROD is allowed */
  local!prodRegions: index(
    local!regions.regionCode,
    wherecontains(true, toboolean(local!regions.prodAllowed)),
    {}
  ),
  local!quota: rule!MCP_QE_getQuotaByTeam(teamId: local!r.teamId),
  local!used: rule!MCP_getTeamUtilization(teamId: local!r.teamId, excludeRequestId: local!r.requestId),
  local!cost: rule!MCP_estimateMonthlyCost(
    providerCode: local!r.providerCode, vcpu: local!r.vcpuPerNode, ramGb: local!r.ramGbPerNode,
    storageGb: local!r.storageGbPerNode, nodes: local!r.nodeCount
  ),
  local!ratio: if(local!r.vcpuPerNode > 0, local!r.ramGbPerNode / local!r.vcpuPerNode, 0),

  /* Quota checks expressed as data, evaluated with a!forEach */
  local!quotaChecks: {
    a!map(code: "POL-003", name: "vCPU quota",     used: local!used.vcpu,      req: local!r.vcpuPerNode * local!r.nodeCount,      limit: local!quota.vcpuLimit),
    a!map(code: "POL-004", name: "Memory quota",   used: local!used.ramGb,     req: local!r.ramGbPerNode * local!r.nodeCount,     limit: local!quota.ramLimitGb),
    a!map(code: "POL-005", name: "Storage quota",  used: local!used.storageGb, req: local!r.storageGbPerNode * local!r.nodeCount, limit: local!quota.storageLimitGb),
    a!map(code: "POL-006", name: "Monthly budget", used: local!used.spend,     req: local!cost,                                   limit: local!quota.monthlyBudget)
  },

  {
    /* POL-001 Node sizing */
    rule!MCP_buildPolicyResult(
      code: "POL-001", name: "Node sizing limit",
      severity: a!match(
        value: true,
        equals: and(not(local!isProd), local!r.vcpuPerNode > 32), then: "BLOCK",
        equals: local!r.vcpuPerNode > 64, then: "BLOCK",
        equals: and(not(local!isProd), local!r.vcpuPerNode > 8), then: "WARN",
        default: "PASS"
      ),
      message: local!r.vcpuPerNode & " vCPU per node"
    ),
    /* POL-002 Approved regions */
    rule!MCP_buildPolicyResult(
      code: "POL-002", name: "Approved regions",
      severity: if(
        or(
          not(contains(touniformstring(local!regions.regionCode), local!r.regionCode)),
          and(local!isProd, not(contains(touniformstring(local!prodRegions), local!r.regionCode)))
        ),
        "BLOCK", "PASS"
      ),
      message: if(local!isProd, "PROD allowed in: " & joinarray(local!prodRegions, ", "), local!r.regionCode & " enabled")
    ),
    /* POL-003 … POL-006 Quotas & budget */
    a!forEach(
      items: local!quotaChecks,
      expression: a!localVariables(
        local!after: fv!item.used + fv!item.req,
        local!pct: if(fv!item.limit > 0, local!after / fv!item.limit * 100, 0),
        rule!MCP_buildPolicyResult(
          code: fv!item.code, name: fv!item.name,
          severity: if(local!after > fv!item.limit, "BLOCK", if(local!pct > 85, "WARN", "PASS")),
          message: fixed(local!pct, 0) & "% of " & lower(fv!item.name) & " after provisioning"
        )
      )
    ),
    /* POL-007 Non-PROD TTL */
    rule!MCP_buildPolicyResult(
      code: "POL-007", name: "Non-PROD TTL",
      severity: if(and(not(local!isProd), or(a!defaultValue(local!r.ttlDays, 0) < 1, local!r.ttlDays > 30)), "BLOCK", "PASS"),
      message: if(local!isProd, "PROD — no TTL required", "Auto-decommission after " & local!r.ttlDays & " days")
    ),
    /* POL-008 PROD high availability */
    rule!MCP_buildPolicyResult(
      code: "POL-008", name: "PROD high availability",
      severity: if(and(local!isProd, local!r.nodeCount < 3), "BLOCK", "PASS"),
      message: local!r.nodeCount & " nodes"
    ),
    /* POL-009 Memory : CPU ratio */
    rule!MCP_buildPolicyResult(
      code: "POL-009", name: "Memory/CPU ratio",
      severity: if(or(local!ratio < 2, local!ratio > 8), "WARN", "PASS"),
      message: "Ratio 1:" & fixed(local!ratio, 1)
    ),
    /* POL-010 Naming & tags */
    rule!MCP_buildPolicyResult(
      code: "POL-010", name: "Naming & tags",
      severity: if(
        or(
          not(regexmatch("^[a-z][a-z0-9-]{2,30}$", local!r.appName)),
          len(trim(local!r.justification)) < 20
        ),
        "BLOCK", "PASS"
      ),
      message: "Name, cost-center and owner tags"
    )
  }
)
