# Process models

Four process models drive the application. All write to `MCP_AUDIT_LOG` through the sub-process **MCP Write Audit Event** so every transition is traceable by `correlation_id` (the process instance id).

## 1. MCP Submit Environment Request

Started from the **New Request** form (site action).

```mermaid
flowchart LR
  A([Start: form submit]) --> B[Script task:<br/>rule!MCP_evaluatePolicies]
  B --> C[Script task:<br/>rule!MCP_determineApprovalRoute]
  C --> D{XOR: route}
  D -- BLOCKED --> X([End: return validation])
  D -- AUTO --> E[Write records:<br/>status = APPROVED]
  D -- L1 / L1_L2 --> F[Write records:<br/>status = PENDING_L1]
  E --> G[[Start process:<br/>MCP Provision Environment]]
  F --> H[[Sub-process:<br/>MCP Review Request]]
  G --> Z([End])
  H --> Z
```

## 2. MCP Review Request

| Node | Type | Assignment / logic |
|---|---|---|
| L1 review | User input task (`interface!MCP_ReviewRequestTask`) | Group `MCP L1 Approvers`, escalation after 24h |
| Re-evaluate policies | Script task | Re-runs `rule!MCP_evaluatePolicies` — quotas may have moved |
| Decision gateway | XOR | REJECTED → end · route `L1_L2` → L2 · else → provision |
| L2 review | User input task | Group `MCP L2 Approvers`, escalation after 48h |
| Notify | Integration `MCP_INT_PostNotification` | Requestor + channel |

```mermaid
flowchart LR
  S([Start]) --> L1[/L1 Team Lead task/]
  L1 --> R1[Re-evaluate policies]
  R1 --> G1{Decision}
  G1 -- Rejected --> N1[Notify requestor] --> E([End])
  G1 -- Approved & L1_L2 --> L2[/L2 Governance task/]
  G1 -- Approved & L1 --> P[[MCP Provision Environment]]
  L2 --> G2{Decision}
  G2 -- Rejected --> N1
  G2 -- Approved --> P --> E
```

## 3. MCP Provision Environment (asynchronous)

Long-running; designed so no node blocks an engine thread.

```mermaid
flowchart LR
  S([Start]) --> I[Integration:<br/>MCP_INT_CreateDeployment<br/>POST /v1/deployments]
  I --> W{{Receive message event:<br/>Web API callback}}
  I --> T((Timer: every 30s))
  T --> Q[Integration:<br/>GET /v1/deployments/jobId]
  Q --> G{state?}
  G -- RUNNING --> T
  G -- FAILED --> X[/Exception task:<br/>Retry or cancel/]
  G -- SUCCEEDED --> C
  W --> C[Write records:<br/>MCP_CLOUD_ASSET + status ACTIVE]
  X -- Retry --> I
  C --> N[Notify requestor] --> E([End])
```

- **Activity chaining** is disabled after the integration node so the process goes asynchronous.
- **Inbound path**: the orchestrator calls `MCP_WebAPI_DeploymentCallback`, which uses `a!startProcess` / message correlation on `jobId`.
- **Polling fallback**: if the callback never arrives, the timer loop polls the status endpoint (max 60 attempts).
- **Exception flow**: provider errors (for example `InsufficientCapacity`) send an exception task to `MCP Administrators` with Retry / Cancel.

## 4. MCP Lifecycle Sweep (scheduled, daily 02:00 IST)

1. Query `MCP_VW_EXPIRED_ASSETS`.
2. Run **MCP Decommission Asset** for each row (MNI): `DELETE /v1/deployments/{assetId}` → asset `TERMINATED`, request `DECOMMISSIONED`.
3. Send a 48-hour expiry warning to owners of assets expiring soon.
4. Write a `LIFECYCLE_SWEEP` audit summary.
