/* rule!MCP_buildPolicyResult — constructor helper
   Inputs: ri!code, ri!name, ri!severity, ri!message (Text) */
'type!{urn:com:appian:types:MCP}MCP_PolicyResult'(
  policyCode: ri!code,
  policyName: ri!name,
  severity: ri!severity,
  message: ri!message,
  engineVersion: cons!MCP_POLICY_ENGINE_VERSION,
  evaluatedOn: now()
)
