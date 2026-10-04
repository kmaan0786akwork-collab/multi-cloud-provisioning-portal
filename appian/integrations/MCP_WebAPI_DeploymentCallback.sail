/* Web API: MCP_WebAPI_DeploymentCallback
   Endpoint : POST /suite/webapi/mcp-deployment-callback
   Security : Service account in group "MCP Integration Accounts" + HMAC signature header */
a!localVariables(
  local!body: a!fromJson(http!request.body),
  local!signature: index(http!request.headers, "X-Signature", null),
  local!expected: "sha256=" & rule!MCP_hmacSha256(secret: cons!MCP_CALLBACK_SECRET, payload: http!request.body),
  local!request: index(
    rule!MCP_QE_getRequestByJobId(jobId: local!body.jobId),
    1,
    null
  ),
  a!match(
    value: true,
    equals: local!signature <> local!expected,
    then: a!httpResponse(statusCode: 401, body: a!toJson(a!map(error: "invalid signature"))),

    equals: a!isNullOrEmpty(local!request),
    then: a!httpResponse(statusCode: 404, body: a!toJson(a!map(error: "unknown jobId"))),

    default: a!startProcess(
      processModel: cons!MCP_PM_COMPLETE_DEPLOYMENT,
      processParameters: a!map(
        requestId: local!request.requestId,
        jobId: local!body.jobId,
        finalState: local!body.state,          /* SUCCEEDED | FAILED */
        endpointUrl: local!body.endpoint,
        errorMessage: local!body.error
      ),
      onSuccess: a!httpResponse(
        statusCode: 200,
        headers: a!httpHeader(name: "Content-Type", value: "application/json"),
        body: a!toJson(a!map(accepted: true, processInstance: fv!processInfo.pp.id))
      ),
      onError: a!httpResponse(statusCode: 500, body: a!toJson(a!map(error: "could not start process")))
    )
  )
)
