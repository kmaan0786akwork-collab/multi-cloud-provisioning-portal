/* ==========================================================================
   services.js — Data store, audit tracing, integrations and process engine
   - Store        ≈ Data Store Entities (MariaDB) via a!writeToDataStoreEntity
   - Integrations ≈ Outbound HTTP Integration objects (connected system: MCP Orchestrator)
   - Process      ≈ Process models with gateways, timers and async sub-processes
   ========================================================================== */
window.MCP = window.MCP || {};

/* ---------------------------------------------------------------- Store */
MCP.Store = (function () {
  const KEY = 'nimbusops.state.v3';
  const USER_KEY = 'nimbusops.user';
  let state = null;
  const listeners = [];

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && s.version === 3) { state = s; return; }
      }
    } catch (e) { /* storage unavailable — fall back to memory */ }
    state = MCP.seed();
    save();
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
  function reset() { state = MCP.seed(); save(); emit(); }
  function get() { return state; }
  function emit(kind) { save(); listeners.forEach(fn => { try { fn(kind); } catch (e) { console.error(e); } }); }
  function on(fn) { listeners.push(fn); }
  function nextId(kind, prefix) { const n = state.seq[kind]++; return prefix + n; }

  function currentUser() {
    let id = 'u.riya';
    try { id = localStorage.getItem(USER_KEY) || id; } catch (e) {}
    return MCP.USERS.find(u => u.id === id) || MCP.USERS[0];
  }
  function setUser(id) { try { localStorage.setItem(USER_KEY, id); } catch (e) {} MCP.Store._user = id; emit('user'); }

  return { load, save, reset, get, emit, on, nextId, currentUser, setUser };
})();

/* ---------------------------------------------------------------- Audit */
MCP.Audit = {
  /* Writes to MCP_AUDIT_LOG — every state transition is traced with a correlation id */
  log(actor, action, entityId, details) {
    const s = MCP.Store.get();
    s.audit.unshift({
      id: MCP.Store.nextId('aud', 'AUD-'),
      ts: new Date().toISOString(),
      actor, action,
      entity: entityId.startsWith('AST') ? 'CloudAsset' : entityId.startsWith('REQ') ? 'EnvRequest' : 'System',
      entityId, details
    });
    if (s.audit.length > 500) s.audit.length = 500;
  }
};

/* ---------------------------------------------------------- Integrations */
MCP.Integrations = (function () {
  const BASE = 'https://orchestrator.nimbusops.internal';
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const latency = () => 180 + Math.floor(Math.random() * 420);

  function record(entry) {
    const s = MCP.Store.get();
    s.apiLog.unshift(Object.assign({ id: MCP.Store.nextId('api', 'API-'), ts: new Date().toISOString() }, entry));
    if (s.apiLog.length > 300) s.apiLog.length = 300;
  }

  /* MCP_INT_CreateDeployment — POST /v1/deployments (Bearer token from connected system) */
  async function createDeployment(req) {
    const ms = latency(); await wait(ms);
    const jobId = 'JOB-' + (MCP.Store.get().seq.job++);
    const body = {
      requestId: req.id, provider: req.provider, region: req.region, template: req.template,
      environment: req.envType, nodeCount: req.nodes, nodeSize: { vcpu: req.vcpu, memoryGb: req.ramGb, diskGb: req.storageGb },
      tags: { app: req.appName, costCenter: req.tags.costCenter, owner: req.requestor, ttlDays: req.ttlDays || null }
    };
    record({ integration: 'MCP_INT_CreateDeployment', method: 'POST', endpoint: BASE + '/v1/deployments',
      status: 202, latencyMs: ms, request: body, response: { jobId, state: 'QUEUED', pipeline: 'terraform-' + req.provider.toLowerCase() } });
    return jobId;
  }

  /* MCP_INT_GetDeploymentStatus — GET /v1/deployments/{jobId} (polled by timer event) */
  function getDeploymentStatus(jobId, state, extra) {
    record({ integration: 'MCP_INT_GetDeploymentStatus', method: 'GET', endpoint: `${BASE}/v1/deployments/${jobId}`,
      status: 200, latencyMs: latency(), request: null, response: Object.assign({ jobId, state }, extra || {}) });
  }

  /* MCP_INT_DeleteDeployment — DELETE /v1/deployments/{assetId} */
  async function deleteDeployment(asset, reason) {
    const ms = latency(); await wait(ms);
    record({ integration: 'MCP_INT_DeleteDeployment', method: 'DELETE', endpoint: `${BASE}/v1/deployments/${asset.id}`,
      status: 200, latencyMs: ms, request: { assetId: asset.id, cluster: asset.clusterName, reason }, response: { state: 'DESTROYED' } });
  }

  /* MCP_INT_PostNotification — POST /v1/notifications (Teams/Slack webhook relay) */
  function notify(channel, text) {
    record({ integration: 'MCP_INT_PostNotification', method: 'POST', endpoint: BASE + '/v1/notifications',
      status: 200, latencyMs: latency(), request: { channel, text }, response: { delivered: true } });
  }

  /* Inbound Web API: MCP_WebAPI_DeploymentCallback — POST /suite/webapi/mcp-deployment-callback */
  function inboundCallback(jobId, assetId, state) {
    record({ integration: 'MCP_WebAPI_DeploymentCallback (inbound)', method: 'POST',
      endpoint: '/suite/webapi/mcp-deployment-callback', status: 200, latencyMs: 40 + Math.floor(Math.random() * 60),
      request: { jobId, assetId, state, signature: 'sha256=' + Math.random().toString(16).slice(2, 14) },
      response: { accepted: true, processInstance: 'PI-' + Math.floor(Math.random() * 90000 + 10000) } });
  }

  return { createDeployment, getDeploymentStatus, deleteDeployment, notify, inboundCallback };
})();

/* --------------------------------------------------------------- Process */
MCP.Process = (function () {
  const C = MCP.CONST, R = MCP.Rules, S = MCP.Store, A = MCP.Audit, I = MCP.Integrations;
  const now = () => Date.now();
  const iso = t => new Date(t || Date.now()).toISOString();
  const find = id => S.get().requests.find(r => r.id === id);
  const money = v => '$' + Math.round(v).toLocaleString();

  /* Process model: MCP Submit Environment Request */
  function submit(form, user) {
    const s = S.get();
    const team = s.teams.find(t => t.id === form.teamId);
    const req = Object.assign({}, form, {
      id: S.nextId('req', 'REQ-'),
      requestor: user.name,
      status: 'PENDING_L1',
      createdOn: iso(),
      approvals: [], job: null, assetId: null,
      tags: { costCenter: team ? team.costCenter : '', owner: user.name }
    });
    ['vcpu', 'ramGb', 'storageGb', 'nodes', 'ttlDays'].forEach(k => req[k] = Number(req[k]) || 0);
    if (req.envType === 'PROD') req.ttlDays = 0;

    req.policyResults = R.evaluatePolicies(s, req);
    const route = R.approvalRoute(req.policyResults, req);
    if (route === 'BLOCKED') return { ok: false, error: 'Request blocked by policy. Fix the BLOCK items first.' };
    req.route = route;
    s.requests.unshift(req);
    A.log(user.name, 'REQUEST_SUBMITTED', req.id,
      `${req.envType} ${req.template} on ${req.provider} ${req.region}, est. ${money(R.estimateMonthlyCost(req))}/mo — route ${route}`);

    // XOR gateway on route
    if (route === 'AUTO') {
      req.approvals.push(appr('AUTO', 'Policy Engine', 'System', 'APPROVED', 'Auto-approved: low-cost non-PROD with zero warnings.'));
      req.status = 'APPROVED';
      A.log('System', 'AUTO_APPROVED', req.id, 'Policy engine route AUTO');
      startProvisioning(req);
    } else {
      req.approvals.push(appr('L1', 'Team Lead', 'Arjun Mehta', 'PENDING', ''));
      I.notify('#cloud-approvals', `${req.id} awaiting Team Lead approval (${req.envType}, ${money(R.estimateMonthlyCost(req))}/mo)`);
    }
    S.emit();
    return { ok: true, id: req.id, route };
  }

  function appr(level, role, assignee, decision, comment) {
    return { level, role, assignee, decision, comment, ts: iso() };
  }

  function pendingStep(req) { return req.approvals.find(a => a.decision === 'PENDING'); }

  /* User Input Task: MCP Review Request (L1 / L2) */
  function approve(id, user, comment) {
    const req = find(id); if (!req) return { ok: false, error: 'Not found' };
    const step = pendingStep(req); if (!step) return { ok: false, error: 'No pending approval' };
    // Re-evaluate policies at decision time — quotas may have moved since submission
    req.policyResults = R.evaluatePolicies(S.get(), req);
    if (R.approvalRoute(req.policyResults, req) === 'BLOCKED') {
      A.log('System', 'APPROVAL_BLOCKED', req.id, 'Re-evaluation found BLOCK policy at approval time');
      S.emit();
      return { ok: false, error: 'Policy re-evaluation failed (quota/budget changed). Cannot approve.' };
    }
    step.decision = 'APPROVED'; step.comment = comment || ''; step.ts = iso(); step.assignee = user.name;
    A.log(user.name, step.level + '_APPROVED', req.id, comment || 'Approved');

    if (step.level === 'L1' && req.route === 'L1_L2') {
      req.status = 'PENDING_L2';
      req.approvals.push(appr('L2', 'Cloud Governance', 'Neha Kapoor', 'PENDING', ''));
      I.notify('#cloud-governance', `${req.id} escalated to Cloud Governance Board`);
    } else {
      req.status = 'APPROVED';
      startProvisioning(req);
    }
    S.emit();
    return { ok: true };
  }

  function reject(id, user, comment) {
    const req = find(id); if (!req) return { ok: false, error: 'Not found' };
    if (!comment || comment.trim().length < 5) return { ok: false, error: 'A rejection reason (5+ chars) is required.' };
    const step = pendingStep(req); if (!step) return { ok: false, error: 'No pending approval' };
    step.decision = 'REJECTED'; step.comment = comment; step.ts = iso(); step.assignee = user.name;
    req.status = 'REJECTED';
    A.log(user.name, step.level + '_REJECTED', req.id, comment);
    I.notify('@' + req.requestor.split(' ')[0].toLowerCase(), `${req.id} was rejected: ${comment}`);
    S.emit();
    return { ok: true };
  }

  /* Sub-process: MCP Provision Environment (asynchronous, long-running) */
  async function startProvisioning(req, attempt) {
    req.status = 'PROVISIONING';
    req.job = { jobId: null, step: 0, attempt: attempt || 1, nextAt: now() + C.PROVISION_STEPS[0].ms,
      history: [{ code: 'REQUESTED', label: 'Outbound integration MCP_INT_CreateDeployment', ts: iso(), state: 'DONE' }], error: null };
    A.log('System', 'PROVISION_STARTED', req.id, `Attempt ${req.job.attempt}`);
    S.emit();
    const jobId = await I.createDeployment(req);
    req.job.jobId = jobId;
    req.job.history.push({ code: 'ACCEPTED', label: `202 Accepted — ${jobId}`, ts: iso(), state: 'DONE' });
    S.emit();
  }

  function retry(id, user) {
    const req = find(id);
    if (!req || req.status !== 'FAILED') return { ok: false, error: 'Only failed requests can be retried' };
    A.log(user.name, 'PROVISION_RETRY', req.id, 'Manual retry from exception task');
    startProvisioning(req, (req.job ? req.job.attempt : 1) + 1);
    return { ok: true };
  }

  /* Timer event — advances every running job (resumes after page reload) */
  function tick() {
    const s = S.get(); let changed = false;
    s.requests.filter(r => r.status === 'PROVISIONING' && r.job && r.job.jobId).forEach(req => {
      const job = req.job;
      if (now() < job.nextAt) return;
      const stepDef = C.PROVISION_STEPS[job.step];
      // Simulated provider failure on first apply (≈15%) → exception path
      const shouldFail = stepDef.code === 'APPLYING' && job.attempt === 1 && !job.failChecked && (job.failChecked = true) && (S.get().chaos || Math.random() < 0.15);
      if (shouldFail) {
        job.error = `InsufficientCapacity: ${req.provider} ${req.region} could not allocate ${req.nodes} nodes`;
        job.history.push({ code: 'APPLYING', label: 'terraform apply — FAILED', ts: iso(), state: 'FAILED' });
        req.status = 'FAILED';
        I.getDeploymentStatus(job.jobId, 'FAILED', { error: job.error });
        A.log('System', 'PROVISION_FAILED', req.id, job.error);
        I.notify('#platform-oncall', `${req.id} provisioning failed: ${job.error}`);
        changed = true; return;
      }
      job.history.push({ code: stepDef.code, label: stepDef.label, ts: iso(), state: 'DONE' });
      I.getDeploymentStatus(job.jobId, stepDef.code + '_COMPLETE');
      job.step++;
      if (job.step >= C.PROVISION_STEPS.length) complete(req);
      else job.nextAt = now() + C.PROVISION_STEPS[job.step].ms;
      changed = true;
    });
    return changed;
  }

  function complete(req) {
    const s = S.get();
    const id = S.nextId('ast', 'AST-');
    const name = R.clusterName(req);
    const asset = {
      id, requestId: req.id, teamId: req.teamId, provider: req.provider, region: req.region, envType: req.envType,
      clusterName: name, nodes: req.nodes, vcpu: req.vcpu, ramGb: req.ramGb, storageGb: req.storageGb,
      status: 'RUNNING', cpuUtil: 8, memUtil: 15, podCount: 12, createdOn: iso(),
      expiresOn: req.ttlDays ? iso(now() + req.ttlDays * 864e5) : null,
      endpoint: `https://${name}.${req.provider.toLowerCase()}.nimbusops.internal`,
      logs: [{ ts: iso(), level: 'INFO', msg: `Cluster bootstrapped — ${req.nodes}/${req.nodes} nodes Ready` }]
    };
    s.assets.unshift(asset);
    req.assetId = id; req.status = 'ACTIVE';
    req.job.history.push({ code: 'CALLBACK', label: 'Inbound Web API callback received', ts: iso(), state: 'DONE' });
    I.inboundCallback(req.job.jobId, id, 'SUCCEEDED');
    A.log('System', 'PROVISION_COMPLETED', id, `${name} is RUNNING (${req.id})`);
    I.notify('@' + req.requestor.split(' ')[0].toLowerCase(), `${req.id} is live: ${asset.endpoint}`);
  }

  async function decommission(assetId, user, reason) {
    const s = S.get();
    const asset = s.assets.find(a => a.id === assetId);
    if (!asset || asset.status === 'TERMINATED') return { ok: false };
    asset.status = 'TERMINATING';
    S.emit();
    await I.deleteDeployment(asset, reason);
    asset.status = 'TERMINATED'; asset.cpuUtil = 0; asset.memUtil = 0; asset.podCount = 0;
    asset.logs.unshift({ ts: iso(), level: 'WARN', msg: `Resources destroyed — ${reason}` });
    const req = s.requests.find(r => r.id === asset.requestId);
    if (req) req.status = 'DECOMMISSIONED';
    A.log(user, reason === 'TTL_EXPIRED' ? 'LIFECYCLE_DECOMMISSION' : 'DECOMMISSIONED', asset.id, `${asset.clusterName} — ${reason}`);
    S.emit();
    return { ok: true };
  }

  function extendTtl(assetId, user, days) {
    const asset = S.get().assets.find(a => a.id === assetId);
    if (!asset || !asset.expiresOn) return { ok: false, error: 'PROD assets have no TTL' };
    const created = new Date(asset.createdOn).getTime();
    const next = new Date(asset.expiresOn).getTime() + days * 864e5;
    if ((next - created) / 864e5 > 45) return { ok: false, error: 'Policy POL-007: total lifetime cannot exceed 45 days.' };
    asset.expiresOn = iso(next);
    A.log(user.name, 'TTL_EXTENDED', asset.id, `+${days} days → ${new Date(next).toDateString()}`);
    S.emit();
    return { ok: true };
  }

  /* Scheduled process: MCP Lifecycle Sweep (daily 02:00) */
  async function lifecycleSweep(user) {
    const expired = S.get().assets.filter(a => a.status === 'RUNNING' && a.expiresOn && new Date(a.expiresOn).getTime() < now());
    A.log(user ? user.name : 'System', 'LIFECYCLE_SWEEP', 'SYS-SWEEP', `${expired.length} expired asset(s) found`);
    for (const a of expired) await decommission(a.id, 'System', 'TTL_EXPIRED');
    S.emit();
    return expired.length;
  }

  /* Health telemetry feed for SAIL dashboard (refreshes every few seconds) */
  function healthTick() {
    const msgs = ['Health probe OK — {n}/{n} nodes Ready', 'HPA scaled deployment api-server to {p} replicas',
      'Certificate rotation check passed', 'Node pool autoscaler idle', 'Ingress p95 latency {l}ms'];
    S.get().assets.filter(a => a.status === 'RUNNING' || a.status === 'DEGRADED').forEach(a => {
      const drift = () => Math.round((Math.random() - 0.5) * 14);
      a.cpuUtil = Math.min(98, Math.max(3, a.cpuUtil + drift()));
      a.memUtil = Math.min(97, Math.max(5, a.memUtil + drift()));
      a.podCount = Math.max(4, a.podCount + Math.round((Math.random() - 0.5) * 4));
      const wasDeg = a.status === 'DEGRADED';
      a.status = a.cpuUtil > 88 || a.memUtil > 90 ? 'DEGRADED' : 'RUNNING';
      if (Math.random() < 0.45 || wasDeg !== (a.status === 'DEGRADED')) {
        const level = a.status === 'DEGRADED' ? 'WARN' : 'INFO';
        const msg = a.status === 'DEGRADED'
          ? `High utilization — CPU ${a.cpuUtil}% / MEM ${a.memUtil}%`
          : msgs[Math.floor(Math.random() * msgs.length)].replace(/\{n\}/g, a.nodes)
              .replace('{p}', 2 + Math.floor(Math.random() * 6)).replace('{l}', 40 + Math.floor(Math.random() * 120));
        a.logs.unshift({ ts: iso(), level, msg });
        if (a.logs.length > 40) a.logs.length = 40;
      }
    });
  }

  return { submit, approve, reject, retry, tick, decommission, extendTtl, lifecycleSweep, healthTick, pendingStep };
})();
