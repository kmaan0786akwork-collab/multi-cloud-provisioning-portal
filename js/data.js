/* ==========================================================================
   data.js — Constants + seed data
   Mirrors the Appian data layer: each collection maps 1:1 to a CDT backed by
   a MariaDB table (see /appian/database/schema.sql and /appian/cdt/*.xsd).
   ========================================================================== */
window.MCP = window.MCP || {};

MCP.CONST = {
  APP_NAME: 'NimbusOps',
  PROVIDERS: {
    AWS:   { label: 'AWS',   k8s: 'EKS', vcpuHr: 0.048, ramHr: 0.0062,
             regions: ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-south-1'],
             prodRegions: ['us-east-1', 'eu-west-1', 'ap-south-1'] },
    AZURE: { label: 'Azure', k8s: 'AKS', vcpuHr: 0.050, ramHr: 0.0065,
             regions: ['eastus', 'westeurope', 'centralindia', 'southeastasia'],
             prodRegions: ['eastus', 'westeurope', 'centralindia'] },
    GCP:   { label: 'GCP',   k8s: 'GKE', vcpuHr: 0.045, ramHr: 0.0060,
             regions: ['us-central1', 'europe-west1', 'asia-south1', 'asia-southeast1'],
             prodRegions: ['us-central1', 'asia-south1'] }
  },
  STORAGE_GB_MONTH: 0.10,
  HOURS_PER_MONTH: 730,
  TEMPLATES: {
    K8S:     { label: 'Kubernetes Cluster',          vcpu: 4, ram: 16, storage: 100, nodes: 3 },
    VM_POOL: { label: 'VM Pool (Auto-scaling)',      vcpu: 2, ram: 8,  storage: 50,  nodes: 2 },
    DATA:    { label: 'Data Platform (Spark + DB)',  vcpu: 8, ram: 32, storage: 500, nodes: 3 }
  },
  ENV_TYPES: ['DEV', 'QA', 'STAGING', 'PROD'],
  // Request lifecycle — same values as the MCP_REF_STATUS lookup table
  STATUS: {
    PENDING_L1:     { label: 'Pending Team Lead',   tone: 'amber' },
    PENDING_L2:     { label: 'Pending Governance',  tone: 'amber' },
    APPROVED:       { label: 'Approved',            tone: 'blue'  },
    PROVISIONING:   { label: 'Provisioning',        tone: 'blue'  },
    ACTIVE:         { label: 'Active',              tone: 'green' },
    FAILED:         { label: 'Failed',              tone: 'red'   },
    REJECTED:       { label: 'Rejected',            tone: 'red'   },
    DECOMMISSIONED: { label: 'Decommissioned',      tone: 'gray'  }
  },
  // Async provisioning job stages (process model: MCP Provision Environment)
  PROVISION_STEPS: [
    { code: 'QUEUED',       label: 'Deployment job queued',          ms: 1800 },
    { code: 'VALIDATING',   label: 'terraform validate',             ms: 2200 },
    { code: 'PLANNING',     label: 'terraform plan',                 ms: 2600 },
    { code: 'APPLYING',     label: 'terraform apply',                ms: 3600 },
    { code: 'HEALTH_CHECK', label: 'Cluster health check',           ms: 2200 }
  ],
  POLICY_ENGINE_VERSION: '2.3.0'
};

MCP.USERS = [
  { id: 'u.riya',   name: 'Riya Sharma',  role: 'DEVELOPER',  title: 'Software Engineer',     teams: ['T-PAY', 'T-DATA'] },
  { id: 'u.arjun',  name: 'Arjun Mehta',  role: 'TEAM_LEAD',  title: 'Engineering Lead',      teams: ['T-PAY', 'T-DATA', 'T-MOB'] },
  { id: 'u.neha',   name: 'Neha Kapoor',  role: 'GOVERNANCE', title: 'Cloud Governance Board', teams: [] },
  { id: 'u.vikram', name: 'Vikram Rao',   role: 'ADMIN',      title: 'Platform Administrator', teams: [] }
];

MCP.ROLES = {
  DEVELOPER:  { label: 'Developer',          group: 'MCP Requestors' },
  TEAM_LEAD:  { label: 'Team Lead (L1)',     group: 'MCP L1 Approvers' },
  GOVERNANCE: { label: 'Cloud Governance (L2)', group: 'MCP L2 Approvers' },
  ADMIN:      { label: 'Platform Admin',     group: 'MCP Administrators' }
};

/* Builds a fresh, realistic dataset relative to "now" */
MCP.seed = function () {
  const now = Date.now();
  const H = 3600e3, D = 24 * H;
  const iso = t => new Date(t).toISOString();

  const teams = [
    { id: 'T-PAY',  name: 'Payments Platform', costCenter: 'CC-1042', owner: 'Arjun Mehta' },
    { id: 'T-DATA', name: 'Data Engineering',  costCenter: 'CC-2210', owner: 'Arjun Mehta' },
    { id: 'T-MOB',  name: 'Mobile Apps',       costCenter: 'CC-3307', owner: 'Arjun Mehta' }
  ];

  const quotas = [
    { teamId: 'T-PAY',  vcpuLimit: 96, ramLimitGb: 384, storageLimitGb: 3000, monthlyBudget: 9000 },
    { teamId: 'T-DATA', vcpuLimit: 64, ramLimitGb: 256, storageLimitGb: 5000, monthlyBudget: 7000 },
    { teamId: 'T-MOB',  vcpuLimit: 32, ramLimitGb: 128, storageLimitGb: 1000, monthlyBudget: 3000 }
  ];

  const mkReq = (o) => Object.assign({
    approvals: [], policyResults: [], job: null, assetId: null, tags: {}
  }, o);

  const requests = [
    mkReq({ id: 'REQ-1001', teamId: 'T-PAY', requestor: 'Riya Sharma', provider: 'AWS', region: 'ap-south-1',
      envType: 'PROD', template: 'K8S', vcpu: 8, ramGb: 32, storageGb: 200, nodes: 4, ttlDays: 0,
      appName: 'payments-gateway', justification: 'Production cluster for UPI payment gateway v3.',
      status: 'ACTIVE', createdOn: iso(now - 26 * D), assetId: 'AST-501' }),
    mkReq({ id: 'REQ-1002', teamId: 'T-DATA', requestor: 'Riya Sharma', provider: 'GCP', region: 'asia-south1',
      envType: 'STAGING', template: 'DATA', vcpu: 8, ramGb: 32, storageGb: 500, nodes: 3, ttlDays: 30,
      appName: 'lakehouse-etl', justification: 'Staging for nightly Spark ETL refactor.',
      status: 'ACTIVE', createdOn: iso(now - 12 * D), assetId: 'AST-502' }),
    mkReq({ id: 'REQ-1003', teamId: 'T-PAY', requestor: 'Riya Sharma', provider: 'AZURE', region: 'centralindia',
      envType: 'DEV', template: 'VM_POOL', vcpu: 2, ramGb: 8, storageGb: 50, nodes: 2, ttlDays: 14,
      appName: 'fraud-rules-sandbox', justification: 'Sandbox to test new fraud scoring rules.',
      status: 'ACTIVE', createdOn: iso(now - 12 * D), assetId: 'AST-503' }),
    mkReq({ id: 'REQ-1004', teamId: 'T-MOB', requestor: 'Riya Sharma', provider: 'AWS', region: 'us-east-1',
      envType: 'QA', template: 'K8S', vcpu: 4, ramGb: 16, storageGb: 100, nodes: 3, ttlDays: 21,
      appName: 'mobile-bff', justification: 'QA env for mobile backend-for-frontend release 5.2.',
      status: 'PENDING_L1', createdOn: iso(now - 5 * H) }),
    mkReq({ id: 'REQ-1005', teamId: 'T-PAY', requestor: 'Riya Sharma', provider: 'AWS', region: 'eu-west-1',
      envType: 'PROD', template: 'K8S', vcpu: 16, ramGb: 64, storageGb: 300, nodes: 3, ttlDays: 0,
      appName: 'settlement-engine', justification: 'EU data-residency production cluster for settlements.',
      status: 'PENDING_L2', createdOn: iso(now - 30 * H) }),
    mkReq({ id: 'REQ-1006', teamId: 'T-DATA', requestor: 'Riya Sharma', provider: 'AZURE', region: 'westeurope',
      envType: 'DEV', template: 'DATA', vcpu: 16, ramGb: 64, storageGb: 800, nodes: 2, ttlDays: 7,
      appName: 'ml-feature-store', justification: 'Quick experiment for feature store.',
      status: 'REJECTED', createdOn: iso(now - 4 * D) }),
    mkReq({ id: 'REQ-1007', teamId: 'T-MOB', requestor: 'Riya Sharma', provider: 'GCP', region: 'us-central1',
      envType: 'DEV', template: 'VM_POOL', vcpu: 2, ramGb: 8, storageGb: 50, nodes: 1, ttlDays: 10,
      appName: 'push-notif-poc', justification: 'POC for push notification batching.',
      status: 'DECOMMISSIONED', createdOn: iso(now - 20 * D), assetId: 'AST-499' })
  ];

  // Approval history for seeded records
  const appr = (level, role, assignee, decision, comment, t) => ({ level, role, assignee, decision, comment, ts: iso(t) });
  requests[0].approvals = [
    appr('L1', 'Team Lead', 'Arjun Mehta', 'APPROVED', 'Sizing reviewed with SRE.', now - 26 * D + 3 * H),
    appr('L2', 'Cloud Governance', 'Neha Kapoor', 'APPROVED', 'PROD in approved region, HA confirmed.', now - 25 * D)
  ];
  requests[1].approvals = [appr('L1', 'Team Lead', 'Arjun Mehta', 'APPROVED', 'OK for 30 days.', now - 12 * D + 2 * H)];
  requests[2].approvals = [appr('AUTO', 'Policy Engine', 'System', 'APPROVED', 'Auto-approved: DEV, low cost, no warnings.', now - 12 * D)];
  requests[3].approvals = [appr('L1', 'Team Lead', 'Arjun Mehta', 'PENDING', '', now - 5 * H)];
  requests[4].approvals = [
    appr('L1', 'Team Lead', 'Arjun Mehta', 'APPROVED', 'Needed for EU go-live.', now - 26 * H),
    appr('L2', 'Cloud Governance', 'Neha Kapoor', 'PENDING', '', now - 26 * H)
  ];
  requests[5].approvals = [
    appr('L1', 'Team Lead', 'Arjun Mehta', 'APPROVED', '', now - 4 * D + 2 * H),
    appr('L2', 'Cloud Governance', 'Neha Kapoor', 'REJECTED', 'DEV env sized like PROD — reduce to 4 vCPU / 16 GB.', now - 4 * D + 6 * H)
  ];
  requests[6].approvals = [appr('AUTO', 'Policy Engine', 'System', 'APPROVED', 'Auto-approved.', now - 20 * D)];

  const mkAsset = (id, req, cluster, created, extra) => Object.assign({
    id, requestId: req.id, teamId: req.teamId, provider: req.provider, region: req.region, envType: req.envType,
    clusterName: cluster, nodes: req.nodes, vcpu: req.vcpu, ramGb: req.ramGb, storageGb: req.storageGb,
    status: 'RUNNING', cpuUtil: 40, memUtil: 52, podCount: 30 + req.nodes * 6, createdOn: iso(created),
    expiresOn: req.ttlDays ? iso(created + req.ttlDays * D) : null, endpoint: '', logs: []
  }, extra || {});

  const assets = [
    mkAsset('AST-501', requests[0], 'eks-pay-gw-prod-aps1', now - 25 * D, { cpuUtil: 61, memUtil: 68 }),
    mkAsset('AST-502', requests[1], 'gke-lakehouse-stg-as1', now - 12 * D + 3 * H, { cpuUtil: 34, memUtil: 47 }),
    mkAsset('AST-503', requests[2], 'vmss-fraud-dev-cin', now - 12 * D + 1 * H, { cpuUtil: 12, memUtil: 22 }),
    mkAsset('AST-499', requests[6], 'gce-push-poc-dev-uc1', now - 20 * D, { status: 'TERMINATED', cpuUtil: 0, memUtil: 0, podCount: 0 })
  ];
  assets.forEach(a => {
    a.endpoint = `https://${a.clusterName}.${a.provider.toLowerCase()}.nimbusops.internal`;
    a.logs = a.status === 'TERMINATED'
      ? [{ ts: iso(now - 8 * D), level: 'INFO', msg: 'Resources destroyed by lifecycle sweep (TTL expired).' }]
      : [{ ts: iso(now - 60e3), level: 'INFO', msg: `Health probe OK — ${a.nodes}/${a.nodes} nodes Ready` }];
  });

  const audit = [];
  const log = (t, actor, action, entityId, details) =>
    audit.push({ id: 'AUD-' + (9000 + audit.length), ts: iso(t), actor, action, entity: entityId.startsWith('AST') ? 'CloudAsset' : 'EnvRequest', entityId, details });
  log(now - 26 * D, 'Riya Sharma', 'REQUEST_SUBMITTED', 'REQ-1001', 'PROD K8S on AWS ap-south-1');
  log(now - 25 * D, 'Neha Kapoor', 'L2_APPROVED', 'REQ-1001', 'PROD in approved region, HA confirmed.');
  log(now - 25 * D + H, 'System', 'PROVISION_COMPLETED', 'AST-501', 'eks-pay-gw-prod-aps1 is RUNNING');
  log(now - 20 * D, 'Riya Sharma', 'REQUEST_SUBMITTED', 'REQ-1007', 'DEV VM_POOL on GCP us-central1');
  log(now - 12 * D, 'Riya Sharma', 'REQUEST_SUBMITTED', 'REQ-1002', 'STAGING DATA on GCP asia-south1');
  log(now - 12 * D, 'System', 'AUTO_APPROVED', 'REQ-1003', 'Policy engine: DEV, cost under threshold, 0 warnings');
  log(now - 8 * D, 'System', 'LIFECYCLE_DECOMMISSION', 'AST-499', 'TTL expired — resources destroyed');
  log(now - 4 * D + 6 * H, 'Neha Kapoor', 'L2_REJECTED', 'REQ-1006', 'DEV env sized like PROD — reduce to 4 vCPU / 16 GB.');
  log(now - 30 * H, 'Riya Sharma', 'REQUEST_SUBMITTED', 'REQ-1005', 'PROD K8S on AWS eu-west-1');
  log(now - 26 * H, 'Arjun Mehta', 'L1_APPROVED', 'REQ-1005', 'Needed for EU go-live.');
  log(now - 5 * H, 'Riya Sharma', 'REQUEST_SUBMITTED', 'REQ-1004', 'QA K8S on AWS us-east-1');

  const apiLog = [
    { id: 'API-7001', ts: iso(now - 25 * D), integration: 'MCP_INT_CreateDeployment', method: 'POST',
      endpoint: '/v1/deployments', status: 202, latencyMs: 412,
      request: { requestId: 'REQ-1001', provider: 'AWS', template: 'K8S' }, response: { jobId: 'JOB-88120', state: 'QUEUED' } },
    { id: 'API-7002', ts: iso(now - 8 * D), integration: 'MCP_INT_DeleteDeployment', method: 'DELETE',
      endpoint: '/v1/deployments/AST-499', status: 200, latencyMs: 377,
      request: { assetId: 'AST-499', reason: 'TTL_EXPIRED' }, response: { state: 'DESTROYED' } }
  ];

  return { version: 3, seq: { req: 1008, ast: 504, aud: 9000 + audit.length, api: 7003, job: 88200 },
           teams, quotas, requests, assets, audit: audit.reverse(), apiLog: apiLog.reverse() };
};
