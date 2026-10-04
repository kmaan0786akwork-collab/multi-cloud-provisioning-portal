/* ==========================================================================
   rules.js — Expression rules
   Each function is a JS port of an Appian expression rule in
   /appian/expression-rules. Array-filtering logic mirrors a!forEach(),
   wherecontains(), index() and sum() patterns used in the SAIL originals.
   ========================================================================== */
window.MCP = window.MCP || {};

MCP.Rules = (function () {
  const C = MCP.CONST;
  const COMMITTED = ['APPROVED', 'PROVISIONING', 'ACTIVE'];

  /* rule!MCP_estimateMonthlyCost(provider, vcpu, ramGb, storageGb, nodes) */
  function estimateMonthlyCost(r) {
    const p = C.PROVIDERS[r.provider];
    if (!p) return 0;
    const n = Number(r.nodes) || 0;
    const compute = (Number(r.vcpu) || 0) * n * p.vcpuHr * C.HOURS_PER_MONTH;
    const memory = (Number(r.ramGb) || 0) * n * p.ramHr * C.HOURS_PER_MONTH;
    const storage = (Number(r.storageGb) || 0) * n * C.STORAGE_GB_MONTH;
    return Math.round((compute + memory + storage) * 100) / 100;
  }

  /* rule!MCP_getTeamUtilization(teamId, excludeRequestId)
     Filters committed requests for the team, then sums each dimension. */
  function teamUtilization(state, teamId, excludeId) {
    const rows = state.requests.filter(r =>
      r.teamId === teamId && COMMITTED.includes(r.status) && r.id !== excludeId);
    const sum = f => rows.reduce((a, r) => a + f(r), 0);
    return {
      vcpu: sum(r => r.vcpu * r.nodes),
      ramGb: sum(r => r.ramGb * r.nodes),
      storageGb: sum(r => r.storageGb * r.nodes),
      spend: Math.round(sum(r => estimateMonthlyCost(r)) * 100) / 100,
      count: rows.length
    };
  }

  function quotaFor(state, teamId) {
    return state.quotas.find(q => q.teamId === teamId);
  }

  /* rule!MCP_evaluatePolicies(request) → list of MCP_PolicyResult
     Severity: BLOCK (cannot submit) | WARN (forces L2 review) | PASS */
  function evaluatePolicies(state, r) {
    const out = [];
    const add = (code, name, severity, message) => out.push({ code, name, severity, message });
    const prov = C.PROVIDERS[r.provider];
    const isProd = r.envType === 'PROD';
    const n = Number(r.nodes) || 0, vcpu = Number(r.vcpu) || 0, ram = Number(r.ramGb) || 0, sto = Number(r.storageGb) || 0;
    const ttl = Number(r.ttlDays) || 0;

    // POL-001 node sizing
    if (vcpu > 32 && !isProd) add('POL-001', 'Node sizing limit', 'BLOCK', `${vcpu} vCPU/node exceeds 32 vCPU cap for non-PROD.`);
    else if (vcpu > 64) add('POL-001', 'Node sizing limit', 'BLOCK', `${vcpu} vCPU/node exceeds 64 vCPU cap.`);
    else if (vcpu > 8 && !isProd) add('POL-001', 'Node sizing limit', 'WARN', `Non-PROD node over 8 vCPU — governance review required.`);
    else add('POL-001', 'Node sizing limit', 'PASS', `${vcpu} vCPU/node within limits.`);

    // POL-002 region residency
    if (prov && !prov.regions.includes(r.region)) add('POL-002', 'Approved regions', 'BLOCK', `${r.region || '—'} is not an enabled ${prov.label} region.`);
    else if (isProd && prov && !prov.prodRegions.includes(r.region))
      add('POL-002', 'Approved regions', 'BLOCK', `PROD not allowed in ${r.region}. Allowed: ${prov.prodRegions.join(', ')}.`);
    else add('POL-002', 'Approved regions', 'PASS', `${r.region || '—'} approved for ${r.envType}.`);

    // POL-003..006 quotas + budget
    const q = quotaFor(state, r.teamId);
    if (q) {
      const u = teamUtilization(state, r.teamId, r.id);
      const cost = estimateMonthlyCost(r);
      const checks = [
        ['POL-003', 'vCPU quota', u.vcpu, vcpu * n, q.vcpuLimit, 'vCPU'],
        ['POL-004', 'Memory quota', u.ramGb, ram * n, q.ramLimitGb, 'GB RAM'],
        ['POL-005', 'Storage quota', u.storageGb, sto * n, q.storageLimitGb, 'GB storage'],
        ['POL-006', 'Monthly budget', u.spend, cost, q.monthlyBudget, 'USD']
      ];
      checks.forEach(([code, name, used, req, limit, unit]) => {
        const after = used + req, pct = limit ? (after / limit) * 100 : 0;
        const fmt = v => unit === 'USD' ? '$' + Math.round(v).toLocaleString() : Math.round(v).toLocaleString();
        if (after > limit) add(code, name, 'BLOCK', `Would use ${fmt(after)} of ${fmt(limit)} ${unit === 'USD' ? '' : unit} (${pct.toFixed(0)}%).`);
        else if (pct > 85) add(code, name, 'WARN', `Would reach ${pct.toFixed(0)}% of ${name.toLowerCase()}.`);
        else add(code, name, 'PASS', `${pct.toFixed(0)}% of ${name.toLowerCase()} after provisioning.`);
      });
    }

    // POL-007 TTL for non-PROD
    if (!isProd && (ttl < 1 || ttl > 30)) add('POL-007', 'Non-PROD TTL', 'BLOCK', 'Non-PROD environments need a TTL of 1–30 days.');
    else add('POL-007', 'Non-PROD TTL', 'PASS', isProd ? 'PROD — no TTL required.' : `Auto-decommission after ${ttl} days.`);

    // POL-008 HA for PROD
    if (isProd && n < 3) add('POL-008', 'PROD high availability', 'BLOCK', 'PROD requires at least 3 nodes across zones.');
    else add('POL-008', 'PROD high availability', 'PASS', isProd ? `${n} nodes — multi-AZ OK.` : 'Not applicable.');

    // POL-009 memory:cpu ratio
    const ratio = vcpu ? ram / vcpu : 0;
    if (vcpu && (ratio < 2 || ratio > 8)) add('POL-009', 'Memory/CPU ratio', 'WARN', `Ratio 1:${ratio.toFixed(1)} is outside the 1:2–1:8 band.`);
    else add('POL-009', 'Memory/CPU ratio', 'PASS', `Ratio 1:${ratio.toFixed(1)}.`);

    // POL-010 naming + tagging
    if (!/^[a-z][a-z0-9-]{2,30}$/.test(r.appName || '')) add('POL-010', 'Naming & tags', 'BLOCK', 'App name must be lowercase-kebab (3–31 chars).');
    else if ((r.justification || '').trim().length < 20) add('POL-010', 'Naming & tags', 'BLOCK', 'Business justification must be at least 20 characters.');
    else add('POL-010', 'Naming & tags', 'PASS', 'Name, cost-center and owner tags valid.');

    return out;
  }

  /* rule!MCP_determineApprovalRoute(policyResults, envType, estCost)
     Returns: AUTO | L1 | L1_L2 | BLOCKED */
  function approvalRoute(results, r) {
    const has = sev => results.some(p => p.severity === sev);
    if (has('BLOCK')) return 'BLOCKED';
    const cost = estimateMonthlyCost(r);
    if (r.envType === 'PROD' || has('WARN') || cost >= 2500) return 'L1_L2';
    if ((r.envType === 'DEV' || r.envType === 'QA') && cost < 600) return 'AUTO';
    return 'L1';
  }

  const ROUTE_LABEL = {
    AUTO: 'Auto-approve (policy engine)',
    L1: 'Team Lead approval',
    L1_L2: 'Team Lead → Cloud Governance',
    BLOCKED: 'Blocked by policy'
  };

  /* rule!MCP_generateClusterName(request) */
  function clusterName(r) {
    const prefix = { AWS: 'eks', AZURE: 'aks', GCP: 'gke' }[r.provider] || 'k8s';
    const kind = r.template === 'VM_POOL' ? { AWS: 'asg', AZURE: 'vmss', GCP: 'mig' }[r.provider] : prefix;
    const env = { DEV: 'dev', QA: 'qa', STAGING: 'stg', PROD: 'prod' }[r.envType];
    const reg = r.region.replace(/[^a-z0-9]/g, '').slice(0, 6);
    return `${kind}-${r.appName}-${env}-${reg}`;
  }

  return { estimateMonthlyCost, teamUtilization, quotaFor, evaluatePolicies, approvalRoute, ROUTE_LABEL, clusterName, COMMITTED };
})();
