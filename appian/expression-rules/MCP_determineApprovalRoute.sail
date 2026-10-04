/* rule!MCP_determineApprovalRoute
   Inputs : ri!policyResults (List of MCP_PolicyResult), ri!envType (Text), ri!estCost (Decimal)
   Returns: Text — BLOCKED | AUTO | L1 | L1_L2
   Drives the XOR gateway in process model "MCP Submit Environment Request". */
a!localVariables(
  local!severities: touniformstring(ri!policyResults.severity),
  local!hasBlock: contains(local!severities, "BLOCK"),
  local!hasWarn: contains(local!severities, "WARN"),
  a!match(
    value: true,
    equals: local!hasBlock, then: "BLOCKED",
    equals: or(ri!envType = "PROD", local!hasWarn, ri!estCost >= cons!MCP_L2_COST_THRESHOLD), then: "L1_L2", /* 2500 */
    equals: and(contains({"DEV", "QA"}, ri!envType), ri!estCost < cons!MCP_AUTO_APPROVE_COST_LIMIT), then: "AUTO", /* 600 */
    default: "L1"
  )
)
