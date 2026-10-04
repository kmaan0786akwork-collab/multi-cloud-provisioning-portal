/* rule!MCP_generateClusterName
   Inputs : ri!request (MCP_EnvRequest)
   Returns: Text — e.g. eks-checkout-api-prod-apsout */
a!localVariables(
  local!k8sPrefix: displayvalue(ri!request.providerCode, {"AWS", "AZURE", "GCP"}, {"eks", "aks", "gke"}, "k8s"),
  local!vmPrefix: displayvalue(ri!request.providerCode, {"AWS", "AZURE", "GCP"}, {"asg", "vmss", "mig"}, "vm"),
  local!env: displayvalue(ri!request.envType, {"DEV", "QA", "STAGING", "PROD"}, {"dev", "qa", "stg", "prod"}, "x"),
  local!region: left(cleanwith(lower(ri!request.regionCode), "abcdefghijklmnopqrstuvwxyz0123456789"), 6),
  joinarray(
    {
      if(ri!request.templateCode = "VM_POOL", local!vmPrefix, local!k8sPrefix),
      ri!request.appName,
      local!env,
      local!region
    },
    "-"
  )
)
