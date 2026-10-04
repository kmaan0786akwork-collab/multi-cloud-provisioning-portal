# Integrations

## Connected system: `MCP Orchestrator API`

| Property | Value |
|---|---|
| Type | HTTP |
| Base URL | `https://orchestrator.nimbusops.internal` |
| Authentication | OAuth 2.0 Client Credentials (secret stored in the connected system, never in rules) |
| Timeout | 30 s |
| Contract | [`orchestrator-openapi.yaml`](orchestrator-openapi.yaml) |

## Outbound integration objects

| Object | Method | Path | Used by |
|---|---|---|---|
| `MCP_INT_CreateDeployment` | POST | `/v1/deployments` | MCP Provision Environment |
| `MCP_INT_GetDeploymentStatus` | GET | `/v1/deployments/{jobId}` | Timer polling loop |
| `MCP_INT_DeleteDeployment` | DELETE | `/v1/deployments/{assetId}` | Decommission / Lifecycle Sweep |
| `MCP_INT_PostNotification` | POST | `/v1/notifications` | Approvals, failures, go-live |

Every call is logged to `MCP_API_CALL_LOG` (method, status, latency, request and response bodies) and shown on the **Integrations** page.

## Inbound Web API: `MCP_WebAPI_DeploymentCallback`

`POST /suite/webapi/mcp-deployment-callback` is called by the CI/CD pipeline when a deployment finishes. See [`MCP_WebAPI_DeploymentCallback.sail`](MCP_WebAPI_DeploymentCallback.sail).

- Validates the HMAC `X-Signature` header against a secret held in a constant
- Correlates on `jobId` and sends a message event to the waiting process instance
- Returns `200 {accepted:true}`, `401` on a bad signature, `404` for an unknown job
