/* ==========================================================================
   ui.js — SAIL-style interfaces
   Each view* function corresponds to an Appian interface object
   (see /appian/interfaces). Role-based visibility mirrors group-based
   security on the Appian Site pages.
   ========================================================================== */
(function () {
  const C = MCP.CONST, R = MCP.Rules, S = MCP.Store, P = MCP.Process;
  const $view = document.getElementById('view');
  const ui = { route: 'dashboard', param: null, filters: {}, expanded: null, form: null };

  /* ------------------------------------------------------------ helpers */
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = v => '$' + Math.round(v || 0).toLocaleString('en-US');
  const fmtDate = t => t ? new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const fmtDT = t => t ? new Date(t).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
  const fmtTime = t => new Date(t).toLocaleTimeString('en-GB');
  function rel(t) {
    const d = (Date.now() - new Date(t).getTime()) / 1000;
    const fut = d < 0, a = Math.abs(d);
    const s = a < 60 ? `${Math.round(a)}s` : a < 3600 ? `${Math.round(a / 60)}m` : a < 86400 ? `${Math.round(a / 3600)}h` : `${Math.round(a / 86400)}d`;
    return fut ? `in ${s}` : `${s} ago`;
  }
  const initials = n => n.split(' ').map(x => x[0]).join('').slice(0, 2);
  const team = id => S.get().teams.find(t => t.id === id) || { name: id, costCenter: '' };
  const statusTag = st => { const m = C.STATUS[st] || { label: st, tone: 'gray' }; return `<span class="tag t-${m.tone}">${esc(m.label)}</span>`; };
  const assetTag = st => `<span class="tag t-${{ RUNNING: 'green', DEGRADED: 'amber', TERMINATING: 'blue', TERMINATED: 'gray' }[st] || 'gray'}">${esc(st)}</span>`;
  const sevTag = sv => `<span class="tag plain t-${{ PASS: 'green', WARN: 'amber', BLOCK: 'red' }[sv]}">${sv}</span>`;
  const prov = p => `<span class="chip ${p.toLowerCase()}">${esc(C.PROVIDERS[p].label)}</span>`;
  const pctClass = p => p > 90 ? 'crit' : p > 75 ? 'warn' : 'ok';
  const meter = (label, used, limit, unit, proj) => {
    const pct = limit ? Math.min(100, used / limit * 100) : 0;
    const pj = proj ? Math.min(100 - pct, proj / limit * 100) : 0;
    if (unit === '%') return `<div class="meter"><div class="meter-top"><b>${esc(label)}</b><span class="muted">${Math.round(used)}%</span></div><div class="bar"><span class="${pctClass(pct)}" style="width:${pct}%"></span></div></div>`;
    const f = v => unit === '$' ? money(v) : Math.round(v).toLocaleString() + (unit ? ' ' + unit : '');
    return `<div class="meter"><div class="meter-top"><b>${esc(label)}</b><span class="muted">${f(used)}${proj ? ` <span style="color:var(--brand)">+${f(proj)}</span>` : ''} / ${f(limit)}</span></div>
      <div class="bar"><span class="${pctClass(pct + pj)}" style="width:${pct}%"></span>${pj ? `<span class="proj" style="left:${pct}%;width:${pj}%"></span>` : ''}</div></div>`;
  };
  const entityLink = id => id.startsWith('SYS') ? `<span class="mono">${esc(id)}</span>`
    : `<a class="mono" href="${id.startsWith('AST') ? '#/environment/' : '#/request/'}${esc(id)}">${esc(id)}</a>`;
  const user = () => S.currentUser();
  const role = () => user().role;

  function toast(msg, err) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.className = 'toast show' + (err ? ' err' : '');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.className = 'toast', 2600);
  }

  /* ------------------------------------------------------- data scoping */
  function visibleRequests() {
    const u = user(), all = S.get().requests;
    if (u.role === 'DEVELOPER') return all.filter(r => r.requestor === u.name);
    if (u.role === 'TEAM_LEAD') return all.filter(r => u.teams.includes(r.teamId));
    return all;
  }
  function visibleAssets() {
    const u = user(), all = S.get().assets;
    if (u.role === 'DEVELOPER' || u.role === 'TEAM_LEAD') return all.filter(a => u.teams.includes(a.teamId));
    return all;
  }
  function myQueue() {
    const r = role();
    const status = r === 'TEAM_LEAD' ? 'PENDING_L1' : r === 'GOVERNANCE' ? 'PENDING_L2' : null;
    return status ? S.get().requests.filter(x => x.status === status) : [];
  }
  const canAct = req => (role() === 'TEAM_LEAD' && req.status === 'PENDING_L1') || (role() === 'GOVERNANCE' && req.status === 'PENDING_L2');

  /* --------------------------------------------------------- navigation */
  const NAV = {
    DEVELOPER:  ['dashboard', 'new', 'requests', 'environments'],
    TEAM_LEAD:  ['dashboard', 'approvals', 'requests', 'environments', 'quotas'],
    GOVERNANCE: ['dashboard', 'approvals', 'requests', 'environments', 'quotas', 'audit'],
    ADMIN:      ['dashboard', 'requests', 'environments', 'quotas', 'audit', 'integrations']
  };
  const LABEL = { dashboard: 'Dashboard', new: 'New Request', requests: 'Requests', approvals: 'Approvals',
    environments: 'Environments', quotas: 'Quotas & Budgets', audit: 'Audit Trail', integrations: 'Integrations' };

  function renderChrome() {
    const u = user(), q = myQueue().length;
    document.getElementById('tabs').innerHTML = NAV[u.role].map(k =>
      `<a href="#/${k}" class="${ui.route === k || (k === 'requests' && ui.route === 'request') || (k === 'environments' && ui.route === 'environment') ? 'active' : ''}">${
        k === 'requests' && u.role === 'DEVELOPER' ? 'My Requests' : LABEL[k]}${k === 'approvals' && q ? `<span class="count">${q}</span>` : ''}</a>`).join('');
    document.getElementById('persona').innerHTML = `
      <div class="persona-label"><span>Viewing as</span><span style="color:#fff;font-weight:600">${esc(MCP.ROLES[u.role].group)}</span></div>
      <div class="avatar" title="${esc(u.name)}">${initials(u.name)}</div>
      <select id="userSel" aria-label="Switch persona">${MCP.USERS.map(x =>
        `<option value="${x.id}" ${x.id === u.id ? 'selected' : ''}>${esc(x.name)} — ${esc(MCP.ROLES[x.role].label)}</option>`).join('')}</select>`;
    document.getElementById('userSel').onchange = e => {
      S.setUser(e.target.value);
      const allowed = NAV[user().role];
      if (!allowed.includes(ui.route) && !['request', 'environment'].includes(ui.route)) location.hash = '#/dashboard';
      else render();
      toast('Switched to ' + user().name);
    };
  }

  function parseHash() {
    const parts = (location.hash || '#/dashboard').replace(/^#\/?/, '').split('/');
    ui.route = parts[0] || 'dashboard'; ui.param = parts[1] || null;
  }

  function render() {
    parseHash();
    renderChrome();
    const views = { dashboard: viewDashboard, new: viewNew, requests: viewRequests, request: viewRequest, approvals: viewApprovals,
      environments: viewEnvironments, environment: viewEnvironment, quotas: viewQuotas, audit: viewAudit, integrations: viewIntegrations };
    const fn = views[ui.route] || viewDashboard;
    $view.innerHTML = fn();
    bind();
  }

  /* ========================================================== DASHBOARD */
  function viewDashboard() {
    const u = user(), s = S.get();
    const reqs = visibleRequests(), assets = visibleAssets();
    const running = assets.filter(a => a.status === 'RUNNING' || a.status === 'DEGRADED');
    const teamIds = u.teams.length ? u.teams : s.teams.map(t => t.id);
    const budget = s.quotas.filter(q => teamIds.includes(q.teamId)).reduce((a, q) => a + q.monthlyBudget, 0);
    const spend = teamIds.reduce((a, t) => a + R.teamUtilization(s, t).spend, 0);
    const pending = u.role === 'DEVELOPER' ? reqs.filter(r => r.status.startsWith('PENDING')).length
      : u.role === 'ADMIN' ? s.requests.filter(r => r.status.startsWith('PENDING')).length : myQueue().length;
    const expiring = running.filter(a => a.expiresOn && new Date(a.expiresOn) - Date.now() < 7 * 864e5);
    const degraded = running.filter(a => a.status === 'DEGRADED').length;

    const greet = { DEVELOPER: 'Request, track and manage your cloud environments.', TEAM_LEAD: 'Review team requests and keep spend inside budget.',
      GOVERNANCE: 'Enforce infrastructure policy across every cloud.', ADMIN: 'Platform health, integrations and lifecycle automation.' }[u.role];

    const kpis = [
      ['Active environments', running.length, `${degraded} degraded · ${assets.filter(a => a.status === 'TERMINATED').length} terminated`],
      [u.role === 'DEVELOPER' ? 'My pending requests' : u.role === 'ADMIN' ? 'Pending approvals (all)' : 'Awaiting my approval', pending, u.role === 'DEVELOPER' ? 'In approval workflow' : 'User input tasks'],
      ['Monthly run-rate', money(spend), `${budget ? Math.round(spend / budget * 100) : 0}% of ${money(budget)} budget`],
      ['Expiring ≤ 7 days', expiring.length, 'Non-PROD TTL — auto-decommission']
    ];

    // spend by provider (committed requests in scope)
    const scopeReqs = s.requests.filter(r => R.COMMITTED.includes(r.status) && teamIds.includes(r.teamId));
    const byProv = Object.keys(C.PROVIDERS).map(p => [p, scopeReqs.filter(r => r.provider === p).reduce((a, r) => a + R.estimateMonthlyCost(r), 0)]);
    const maxP = Math.max(1, ...byProv.map(x => x[1]));

    const l1 = s.requests.filter(r => r.status === 'PENDING_L1' && teamIds.includes(r.teamId));
    const l2 = s.requests.filter(r => r.status === 'PENDING_L2' && teamIds.includes(r.teamId));
    const provList = s.requests.filter(r => r.status === 'PROVISIONING' && teamIds.includes(r.teamId));
    const leaf = r => `<li><a class="leaf" href="#/request/${r.id}" style="text-decoration:none;color:inherit">
        <span><b class="mono">${r.id}</b> · ${esc(r.appName)} <span class="muted">(${r.envType})</span></span>
        <span class="muted small">${money(R.estimateMonthlyCost(r))}/mo · ${rel(r.createdOn)}</span></a></li>`;
    const branch = (title, color, ico, list) => `<li><div class="node"><span class="ico" style="background:${color}">${ico}</span>${title}
        <span class="muted small" style="font-weight:500">(${list.length})</span></div>
        <ul>${list.length ? list.map(leaf).join('') : '<li class="muted small" style="padding-left:2px">No items</li>'}</ul></li>`;

    const activity = s.audit.filter(a => u.role !== 'DEVELOPER' || a.actor === u.name || reqs.some(r => r.id === a.entityId) || assets.some(x => x.id === a.entityId)).slice(0, 7);

    return `
      <div class="page-head"><div><div class="crumb">NimbusOps · ${esc(MCP.ROLES[u.role].label)}</div>
        <h1>Welcome back, ${esc(u.name.split(' ')[0])}</h1><p>${greet}</p></div>
        <div class="row">${u.role === 'DEVELOPER' ? '<a class="btn primary" href="#/new">+ New environment request</a>' : ''}
        ${u.role === 'TEAM_LEAD' || u.role === 'GOVERNANCE' ? `<a class="btn primary" href="#/approvals">Open approvals (${myQueue().length})</a>` : ''}
        ${u.role === 'ADMIN' ? '<button class="btn" data-act="sweep">Run lifecycle sweep</button>' : ''}</div></div>

      <div class="grid g-4" style="margin-bottom:16px">${kpis.map(k => `<div class="card kpi"><div class="accent"></div><div class="label">${k[0]}</div><div class="value">${k[1]}</div><div class="sub">${k[2]}</div></div>`).join('')}</div>

      <div class="grid g-main">
        <div class="stack">
          <div class="card"><div class="card-h"><span class="live-dot"></span><h3>Cluster health</h3><span class="hint">Live telemetry · refreshes every 3s</span><span class="spacer"></span><a class="small" href="#/environments">All environments →</a></div>
            <div class="card-b">${running.length ? `<div class="grid g-3">${running.slice(0, 6).map(healthTile).join('')}</div>` : '<div class="empty">No running environments yet.</div>'}</div></div>
          <div class="card"><div class="card-h"><h3>Recent activity</h3><span class="spacer"></span>${u.role === 'GOVERNANCE' || u.role === 'ADMIN' ? '<a class="small" href="#/audit">Audit trail →</a>' : ''}</div>
            <div class="card-b" style="padding-top:6px;padding-bottom:6px">${activity.map(a => `<div class="act"><span class="d"></span><div><b>${esc(a.action.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase()))}</b> · ${entityLink(a.entityId)}
              <div class="muted">${esc(a.details)} — ${esc(a.actor)}, ${rel(a.ts)}</div></div></div>`).join('') || '<div class="empty">No activity.</div>'}</div></div>
        </div>
        <div class="stack">
          <div class="card"><div class="card-h"><h3>Pending approval tree</h3><span class="hint">Process: MCP Review Request</span></div>
            <div class="card-b"><ul class="tree">
              ${branch('L1 · Team Lead review', '#2457c5', 'L1', l1)}
              ${branch('L2 · Cloud Governance Board', '#a15c00', 'L2', l2)}
              ${branch('Provisioning (async)', '#2f54eb', '⟳', provList)}
            </ul></div></div>
          <div class="card"><div class="card-h"><h3>Run-rate by provider</h3><span class="hint">Committed environments</span></div>
            <div class="card-b">${byProv.map(([p, v]) => `<div class="hbar"><span>${prov(p)}</span><div class="bar"><span style="width:${v / maxP * 100}%"></span></div><span class="num">${money(v)}</span></div>`).join('')}</div></div>
          ${expiring.length ? `<div class="card"><div class="card-h"><h3>Expiring soon</h3></div><div class="card-b" style="padding-top:8px;padding-bottom:8px">${expiring.map(a =>
            `<div class="act"><span class="d" style="background:#e08a00"></span><div><a class="mono" href="#/environment/${a.id}">${esc(a.clusterName)}</a><div class="muted">Expires ${rel(a.expiresOn)} · ${a.envType}</div></div></div>`).join('')}</div></div>` : ''}
        </div>
      </div>`;
  }

  function healthTile(a) {
    return `<div class="health ${a.status.toLowerCase()}" data-go="#/environment/${a.id}">
      <div class="row" style="justify-content:space-between"><span class="name">${esc(a.clusterName)}</span>${assetTag(a.status)}</div>
      <div class="meta">${prov(a.provider)} <span>${esc(a.region)}</span><span>· ${a.envType}</span><span>· ${a.nodes} nodes</span></div>
      ${meter('CPU', a.cpuUtil, 100, '%')}${meter('Memory', a.memUtil, 100, '%')}
      <div class="meta"><span>${a.podCount} pods</span><span class="spacer"></span><span>${a.logs[0] ? rel(a.logs[0].ts) : ''}</span></div></div>`;
  }

  /* ======================================================== NEW REQUEST */
  function defaultForm() {
    const u = user();
    return { teamId: u.teams[0] || S.get().teams[0].id, appName: '', provider: 'AWS', region: 'ap-south-1', envType: 'DEV',
      template: 'K8S', vcpu: 4, ramGb: 16, storageGb: 100, nodes: 3, ttlDays: 14, justification: '' };
  }

  function viewNew() {
    if (role() !== 'DEVELOPER') return `<div class="banner info">Only members of <b>MCP Requestors</b> can submit requests. Switch persona to Riya Sharma (Developer).</div>`;
    if (!ui.form) ui.form = defaultForm();
    const f = ui.form, u = user(), pv = C.PROVIDERS[f.provider];
    const opt = (v, l, sel) => `<option value="${esc(v)}" ${String(v) === String(sel) ? 'selected' : ''}>${esc(l)}</option>`;
    return `
      <div class="page-head"><div><div class="crumb"><a href="#/dashboard">Dashboard</a> / New Request</div>
        <h1>Request a cloud environment</h1><p>Policies, quotas and approval routing are evaluated live as you fill the form.</p></div>
        <button class="btn" data-act="loadSample">Fill sample PROD request</button></div>
      <div class="grid g-main">
        <form class="card" id="reqForm" autocomplete="off">
          <div class="form-section"><h4><span class="n">1</span>Ownership</h4>
            <div class="fgrid">
              <div class="field"><label for="teamId">Team / cost center</label><select class="input" id="teamId" name="teamId">${u.teams.map(t => opt(t, `${team(t).name} (${team(t).costCenter})`, f.teamId)).join('')}</select></div>
              <div class="field"><label for="appName">Application name</label><input class="input mono" id="appName" name="appName" value="${esc(f.appName)}" placeholder="e.g. checkout-api"><span class="help">lowercase-kebab · used in cluster name</span></div>
            </div></div>
          <div class="form-section"><h4><span class="n">2</span>Cloud target</h4>
            <div class="fgrid">
              <div class="field"><label>Provider</label><div class="seg" data-seg="provider">${Object.keys(C.PROVIDERS).map(p => `<button type="button" data-v="${p}" class="${f.provider === p ? 'on' : ''}">${C.PROVIDERS[p].label}</button>`).join('')}</div></div>
              <div class="field"><label>Environment</label><div class="seg" data-seg="envType">${C.ENV_TYPES.map(e => `<button type="button" data-v="${e}" class="${f.envType === e ? 'on' : ''}">${e}</button>`).join('')}</div></div>
              <div class="field"><label for="region">Region</label><select class="input" id="region" name="region">${pv.regions.map(r => opt(r, r + (pv.prodRegions.includes(r) ? '' : '  (non-PROD only)'), f.region)).join('')}</select></div>
              <div class="field"><label for="template">Template</label><select class="input" id="template" name="template">${Object.entries(C.TEMPLATES).map(([k, t]) => opt(k, t.label.replace('Kubernetes', pv.k8s + ' Kubernetes'), f.template)).join('')}</select></div>
            </div></div>
          <div class="form-section"><h4><span class="n">3</span>Sizing (per node)</h4>
            <div class="fgrid c4">
              <div class="field"><label for="vcpu">vCPU</label><input class="input" type="number" min="1" max="96" id="vcpu" name="vcpu" value="${f.vcpu}"></div>
              <div class="field"><label for="ramGb">Memory (GB)</label><input class="input" type="number" min="1" id="ramGb" name="ramGb" value="${f.ramGb}"></div>
              <div class="field"><label for="storageGb">Disk (GB)</label><input class="input" type="number" min="10" id="storageGb" name="storageGb" value="${f.storageGb}"></div>
              <div class="field"><label for="nodes">Nodes</label><input class="input" type="number" min="1" max="50" id="nodes" name="nodes" value="${f.nodes}"></div>
            </div></div>
          <div class="form-section"><h4><span class="n">4</span>Lifecycle &amp; justification</h4>
            <div class="fgrid">
              <div class="field"><label for="ttlDays">Time-to-live (days)</label><input class="input" type="number" min="0" max="60" id="ttlDays" name="ttlDays" value="${f.envType === 'PROD' ? '' : f.ttlDays}" ${f.envType === 'PROD' ? 'disabled placeholder="Not applicable for PROD"' : ''}><span class="help">Non-PROD is auto-decommissioned when TTL expires</span></div>
              <div class="field"><label>Tags (auto-applied)</label><div class="row" style="min-height:36px"><span class="chip">costCenter: ${esc(team(f.teamId).costCenter)}</span><span class="chip">owner: ${esc(u.name)}</span></div></div>
              <div class="field full"><label for="justification">Business justification</label><textarea class="input" id="justification" name="justification" placeholder="What is this environment for?">${esc(f.justification)}</textarea></div>
            </div></div>
          <div class="form-section row"><span class="muted small">Submitting starts process model <b>MCP Submit Environment Request</b>.</span><span class="spacer"></span>
            <button type="button" class="btn" data-act="resetForm">Reset</button><button type="submit" class="btn primary" id="submitBtn">Submit request</button></div>
        </form>
        <div><div class="sticky stack" id="evalPanel">${evalPanel()}</div></div>
      </div>`;
  }

  function evalPanel() {
    const f = ui.form, s = S.get();
    const draft = Object.assign({}, f, { id: '__draft__' });
    const results = R.evaluatePolicies(s, draft);
    const route = R.approvalRoute(results, draft);
    const cost = R.estimateMonthlyCost(draft);
    const q = R.quotaFor(s, f.teamId), u = R.teamUtilization(s, f.teamId);
    const n = +f.nodes || 0;
    const order = { BLOCK: 0, WARN: 1, PASS: 2 };
    const sorted = results.slice().sort((a, b) => order[a.severity] - order[b.severity]);
    const counts = sev => results.filter(r => r.severity === sev).length;
    const pv = C.PROVIDERS[f.provider];
    const compute = (+f.vcpu || 0) * n * pv.vcpuHr * C.HOURS_PER_MONTH, mem = (+f.ramGb || 0) * n * pv.ramHr * C.HOURS_PER_MONTH, sto = (+f.storageGb || 0) * n * C.STORAGE_GB_MONTH;
    return `
      <div class="card"><div class="card-h"><h3>Estimated cost</h3><span class="hint">rule!MCP_estimateMonthlyCost</span></div>
        <div class="card-b"><div class="cost-big">${money(cost)}<span class="muted" style="font-size:14px;font-weight:500"> / month</span></div>
          <div class="muted small" style="margin-top:4px">Compute ${money(compute)} · Memory ${money(mem)} · Storage ${money(sto)}</div>
          <div class="route ${route}" style="margin-top:12px">${{ AUTO: '✓', L1: '→', L1_L2: '⇉', BLOCKED: '✕' }[route]} ${R.ROUTE_LABEL[route]}</div></div></div>
      <div class="card"><div class="card-h"><h3>Quota impact</h3><span class="hint">${esc(team(f.teamId).name)}</span></div>
        <div class="card-b stack" style="gap:12px">
          ${meter('vCPU', u.vcpu, q.vcpuLimit, '', (+f.vcpu || 0) * n)}
          ${meter('Memory', u.ramGb, q.ramLimitGb, 'GB', (+f.ramGb || 0) * n)}
          ${meter('Storage', u.storageGb, q.storageLimitGb, 'GB', (+f.storageGb || 0) * n)}
          ${meter('Budget', u.spend, q.monthlyBudget, '$', cost)}</div></div>
      <div class="card"><div class="card-h"><h3>Policy evaluation</h3><span class="spacer"></span>
          <span class="tag plain t-red">${counts('BLOCK')} block</span><span class="tag plain t-amber">${counts('WARN')} warn</span><span class="tag plain t-green">${counts('PASS')} pass</span></div>
        <div class="card-b" style="padding-top:4px;padding-bottom:4px">${sorted.map(policyRow).join('')}</div></div>`;
  }
  const policyRow = p => `<div class="policy"><span class="code">${p.code}</span><div><div class="nm">${esc(p.name)} ${sevTag(p.severity)}</div><div class="msg">${esc(p.message)}</div></div></div>`;

  function refreshEval() {
    const panel = document.getElementById('evalPanel');
    if (panel) panel.innerHTML = evalPanel();
    const btn = document.getElementById('submitBtn');
    if (btn) {
      const draft = Object.assign({}, ui.form, { id: '__draft__' });
      btn.disabled = R.approvalRoute(R.evaluatePolicies(S.get(), draft), draft) === 'BLOCKED';
    }
  }

  /* =========================================================== REQUESTS */
  function viewRequests() {
    const f = ui.filters.req || (ui.filters.req = { q: '', status: '', provider: '', env: '' });
    let rows = visibleRequests();
    if (f.status) rows = rows.filter(r => r.status === f.status);
    if (f.provider) rows = rows.filter(r => r.provider === f.provider);
    if (f.env) rows = rows.filter(r => r.envType === f.env);
    if (f.q) { const q = f.q.toLowerCase(); rows = rows.filter(r => (r.id + r.appName + r.requestor + team(r.teamId).name).toLowerCase().includes(q)); }
    const sel = (name, all, list, val) => `<select class="input" data-filter="req.${name}"><option value="">${all}</option>${list.map(([v, l]) => `<option value="${v}" ${v === val ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    return `
      <div class="page-head"><div><h1>${role() === 'DEVELOPER' ? 'My requests' : 'Environment requests'}</h1><p>${rows.length} record(s) · record type <span class="mono">MCP Environment Request</span></p></div>
        ${role() === 'DEVELOPER' ? '<a class="btn primary" href="#/new">+ New request</a>' : ''}</div>
      <div class="card">
        <div class="filters">
          <input class="input" placeholder="Search ID, app, requestor…" data-filter="req.q" value="${esc(f.q)}" style="min-width:220px">
          ${sel('status', 'All statuses', Object.entries(C.STATUS).map(([k, v]) => [k, v.label]), f.status)}
          ${sel('provider', 'All providers', Object.keys(C.PROVIDERS).map(k => [k, C.PROVIDERS[k].label]), f.provider)}
          ${sel('env', 'All environments', C.ENV_TYPES.map(e => [e, e]), f.env)}
        </div>
        <div class="tbl-wrap">${rows.length ? `<table class="tbl"><thead><tr><th>Request</th><th>Application</th><th>Team</th><th>Env</th><th>Target</th><th class="num">Est. / month</th><th>Status</th><th>Created</th></tr></thead><tbody>
          ${rows.map(r => `<tr class="click" data-go="#/request/${r.id}"><td class="mono"><a href="#/request/${r.id}">${r.id}</a></td><td><b>${esc(r.appName)}</b><div class="muted small">${esc(r.requestor)}</div></td>
            <td>${esc(team(r.teamId).name)}</td><td><span class="chip">${r.envType}</span></td><td>${prov(r.provider)} <span class="muted small">${esc(r.region)}</span></td>
            <td class="num">${money(R.estimateMonthlyCost(r))}</td><td>${statusTag(r.status)}</td><td class="nowrap muted">${fmtDate(r.createdOn)}</td></tr>`).join('')}
          </tbody></table>` : '<div class="empty">No requests match the filters.</div>'}</div></div>`;
  }

  /* ===================================================== REQUEST DETAIL */
  function viewRequest() {
    const r = S.get().requests.find(x => x.id === ui.param);
    if (!r) return `<div class="banner err">Request ${esc(ui.param)} not found. <a href="#/requests">Back to requests</a></div>`;
    const results = r.policyResults && r.policyResults.length ? r.policyResults : R.evaluatePolicies(S.get(), r);
    const asset = r.assetId ? S.get().assets.find(a => a.id === r.assetId) : null;
    const audit = S.get().audit.filter(a => a.entityId === r.id || (asset && a.entityId === asset.id));
    const u = user();
    const f = (k, v) => `<div><div class="k">${k}</div><div class="v">${v}</div></div>`;
    const canRetry = r.status === 'FAILED' && (u.role === 'ADMIN' || u.name === r.requestor);

    // Provisioning timeline
    let timeline = '';
    if (r.job) {
      const done = r.job.history;
      const curIdx = r.status === 'PROVISIONING' ? r.job.step : -1;
      const remaining = r.status === 'PROVISIONING' ? C.PROVISION_STEPS.slice(r.job.step) : [];
      timeline = `<ul class="steps">${done.map(h => `<li><span class="dot ${h.state === 'FAILED' ? 'fail' : 'done'}">${h.state === 'FAILED' ? '✕' : '✓'}</span><div><div class="t">${esc(h.label)}</div><div class="s">${fmtDT(h.ts)} · ${h.code}</div></div></li>`).join('')}
        ${remaining.map((st, i) => `<li><span class="dot ${i === 0 && r.job.jobId ? 'run' : ''}"></span><div><div class="t">${esc(st.label)}</div><div class="s">${i === 0 ? (r.job.jobId ? 'Running — polling GET /v1/deployments/' + r.job.jobId : 'Waiting for 202 Accepted…') : 'Pending'}</div></div></li>`).join('')}
        ${r.status === 'PROVISIONING' ? `<li><span class="dot"></span><div><div class="t">Inbound Web API callback</div><div class="s">Pending</div></div></li>` : ''}</ul>
        ${r.job.error ? `<div class="banner err" style="margin-top:12px"><div><b>Exception:</b> ${esc(r.job.error)}<div class="small" style="margin-top:4px">Process paused on exception flow — an admin or the requestor can retry.</div></div></div>` : ''}`;
    } else {
      timeline = `<div class="muted">Provisioning starts automatically once the request is approved.</div>`;
    }

    return `
      <div class="page-head"><div><div class="crumb"><a href="#/requests">Requests</a> / ${r.id}</div>
        <h1 class="row" style="gap:12px">${esc(r.appName)} ${statusTag(r.status)}</h1>
        <p><span class="mono">${r.id}</span> · ${r.envType} ${esc(C.TEMPLATES[r.template].label)} on ${C.PROVIDERS[r.provider].label} ${esc(r.region)} · submitted ${rel(r.createdOn)} by ${esc(r.requestor)}</p></div>
        <div class="row">${canRetry ? `<button class="btn primary" data-act="retry" data-id="${r.id}">Retry provisioning</button>` : ''}
          ${asset ? `<a class="btn" href="#/environment/${asset.id}">View environment →</a>` : ''}</div></div>

      ${canAct(r) ? `<div class="card" style="margin-bottom:16px;border-color:#c7d2fe"><div class="card-h" style="background:var(--brand-soft)"><h3>Your review is required</h3><span class="hint">User input task · ${r.status === 'PENDING_L1' ? 'L1 Team Lead' : 'L2 Cloud Governance'}</span></div>
        <div class="card-b"><div class="field"><label for="cmt-${r.id}">Comment</label><textarea class="input" id="cmt-${r.id}" placeholder="Required when rejecting"></textarea></div>
        <div class="row" style="margin-top:10px"><button class="btn success" data-act="approve" data-id="${r.id}">Approve</button><button class="btn danger" data-act="reject" data-id="${r.id}">Reject</button>
        <span class="muted small">Policies are re-evaluated against current quotas when you approve.</span></div></div></div>` : ''}

      <div class="grid g-main">
        <div class="stack">
          <div class="card"><div class="card-h"><h3>Request summary</h3></div><div class="card-b"><div class="fields">
            ${f('Team', esc(team(r.teamId).name))}${f('Cost center', esc(team(r.teamId).costCenter))}${f('Requestor', esc(r.requestor))}
            ${f('Provider / region', prov(r.provider) + ' ' + esc(r.region))}${f('Environment', r.envType)}${f('Template', esc(C.TEMPLATES[r.template].label))}
            ${f('Node size', `${r.vcpu} vCPU · ${r.ramGb} GB · ${r.storageGb} GB disk`)}${f('Nodes', r.nodes)}${f('Total footprint', `${r.vcpu * r.nodes} vCPU · ${r.ramGb * r.nodes} GB RAM`)}
            ${f('Estimated cost', `<b>${money(R.estimateMonthlyCost(r))}</b> / month`)}${f('TTL', r.ttlDays ? r.ttlDays + ' days' : 'None (PROD)')}${f('Approval route', R.ROUTE_LABEL[r.route || R.approvalRoute(results, r)] || '—')}
            <div style="grid-column:1/-1"><div class="k">Justification</div><div class="v">${esc(r.justification)}</div></div></div></div></div>
          <div class="card"><div class="card-h">${r.status === 'PROVISIONING' ? '<span class="live-dot"></span>' : ''}<h3>Provisioning</h3><span class="hint">Async sub-process · ${r.job && r.job.jobId ? r.job.jobId + ' · attempt ' + r.job.attempt : 'not started'}</span></div><div class="card-b">${timeline}</div></div>
          <div class="card"><div class="card-h"><h3>Audit trail</h3><span class="hint">${audit.length} event(s)</span></div><div class="tbl-wrap">
            <table class="tbl"><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Details</th></tr></thead><tbody>${audit.map(a => `<tr><td class="nowrap muted">${fmtDT(a.ts)}</td><td class="nowrap">${esc(a.actor)}</td><td class="mono small">${a.action}</td><td>${esc(a.details)}</td></tr>`).join('')}</tbody></table></div></div>
        </div>
        <div class="stack">
          <div class="card"><div class="card-h"><h3>Approval chain</h3></div><div class="card-b"><ul class="steps">
            ${r.approvals.map(a => `<li><span class="dot ${a.decision === 'APPROVED' ? 'done' : a.decision === 'REJECTED' ? 'fail' : 'wait'}">${a.decision === 'APPROVED' ? '✓' : a.decision === 'REJECTED' ? '✕' : '…'}</span>
              <div><div class="t">${a.level === 'AUTO' ? 'Policy engine' : a.level + ' · ' + esc(a.role)}</div><div class="s">${esc(a.assignee)} · ${a.decision === 'PENDING' ? 'assigned ' + rel(a.ts) : a.decision.toLowerCase() + ' ' + fmtDT(a.ts)}</div>
              ${a.comment ? `<div class="c">${esc(a.comment)}</div>` : ''}</div></li>`).join('') || '<li class="muted">No approvals recorded.</li>'}
          </ul></div></div>
          <div class="card"><div class="card-h"><h3>Policy evaluation</h3><span class="hint">engine v${C.POLICY_ENGINE_VERSION}</span></div><div class="card-b" style="padding-top:4px;padding-bottom:4px">
            ${results.slice().sort((a, b) => ({ BLOCK: 0, WARN: 1, PASS: 2 }[a.severity] - { BLOCK: 0, WARN: 1, PASS: 2 }[b.severity])).map(policyRow).join('')}</div></div>
        </div>
      </div>`;
  }

  /* ========================================================== APPROVALS */
  function viewApprovals() {
    const q = myQueue();
    if (!['TEAM_LEAD', 'GOVERNANCE'].includes(role())) return `<div class="banner info">Approvals are assigned to <b>MCP L1 Approvers</b> and <b>MCP L2 Approvers</b>. Switch persona to Arjun Mehta or Neha Kapoor.</div>`;
    return `
      <div class="page-head"><div><h1>Approvals</h1><p>${q.length} task(s) assigned to <b>${esc(MCP.ROLES[role()].group)}</b></p></div></div>
      <div class="card">${q.length ? q.map(r => {
        const res = R.evaluatePolicies(S.get(), r), warns = res.filter(p => p.severity !== 'PASS');
        return `<div class="task"><div>
            <h4><a class="mono" href="#/request/${r.id}">${r.id}</a> ${esc(r.appName)} <span class="chip">${r.envType}</span> ${prov(r.provider)}</h4>
            <div class="meta"><span>${esc(team(r.teamId).name)}</span><span>${esc(r.requestor)}</span><span>${r.nodes} × ${r.vcpu} vCPU / ${r.ramGb} GB</span><span><b>${money(R.estimateMonthlyCost(r))}</b>/mo</span><span>${esc(r.region)}</span><span>waiting ${rel(r.createdOn).replace(' ago', '')}</span></div>
            <div class="small" style="margin-top:8px;color:var(--ink-2)">${esc(r.justification)}</div>
            ${warns.length ? `<div style="margin-top:8px">${warns.map(w => `<div class="small" style="margin-top:3px">${sevTag(w.severity)} <span class="mono muted">${w.code}</span> ${esc(w.message)}</div>`).join('')}</div>` : '<div class="small" style="margin-top:8px">' + sevTag('PASS') + ' All 10 policies pass</div>'}
          </div><div class="actions">
            <textarea class="input" id="cmt-${r.id}" placeholder="Comment (required to reject)" style="min-height:58px"></textarea>
            <div class="row"><button class="btn success sm" data-act="approve" data-id="${r.id}">Approve</button><button class="btn danger sm" data-act="reject" data-id="${r.id}">Reject</button><span class="spacer"></span><a class="small" href="#/request/${r.id}">Details →</a></div>
          </div></div>`;
      }).join('') : '<div class="empty">🎉 Queue is empty. New tasks appear here when developers submit requests.</div>'}</div>`;
  }

  /* ======================================================= ENVIRONMENTS */
  function viewEnvironments() {
    const f = ui.filters.env || (ui.filters.env = { status: 'ACTIVE' });
    let rows = visibleAssets();
    if (f.status === 'ACTIVE') rows = rows.filter(a => a.status !== 'TERMINATED');
    else if (f.status) rows = rows.filter(a => a.status === f.status);
    return `
      <div class="page-head"><div><h1>Environments</h1><p>Cloud assets tracked in <span class="mono">MCP_CLOUD_ASSET</span> · live health</p></div>
        <div class="seg" data-envfilter>${[['ACTIVE', 'Active'], ['DEGRADED', 'Degraded'], ['TERMINATED', 'Terminated'], ['', 'All']].map(([v, l]) => `<button type="button" data-v="${v}" class="${f.status === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      ${rows.length ? `<div class="grid g-3">${rows.map(healthTile).join('')}</div>` : '<div class="card"><div class="empty">No environments in this view.</div></div>'}`;
  }

  function viewEnvironment() {
    const a = S.get().assets.find(x => x.id === ui.param);
    if (!a) return `<div class="banner err">Environment not found. <a href="#/environments">Back</a></div>`;
    const r = S.get().requests.find(x => x.id === a.requestId);
    const u = user();
    const canManage = a.status === 'RUNNING' || a.status === 'DEGRADED';
    const allowed = u.role === 'ADMIN' || (r && r.requestor === u.name) || (u.role === 'TEAM_LEAD' && u.teams.includes(a.teamId));
    const f = (k, v) => `<div><div class="k">${k}</div><div class="v">${v}</div></div>`;
    return `
      <div class="page-head"><div><div class="crumb"><a href="#/environments">Environments</a> / ${a.id}</div>
        <h1 class="row" style="gap:12px"><span class="mono" style="font-size:19px">${esc(a.clusterName)}</span> ${assetTag(a.status)}</h1>
        <p>${prov(a.provider)} ${esc(a.region)} · ${a.envType} · created ${fmtDate(a.createdOn)} from <a class="mono" href="#/request/${a.requestId}">${a.requestId}</a></p></div>
        <div class="row">${canManage && allowed && a.expiresOn ? `<button class="btn" data-act="extend" data-id="${a.id}">Extend TTL +7d</button>` : ''}
          ${canManage && allowed ? `<button class="btn danger" data-act="decom" data-id="${a.id}">Decommission</button>` : ''}</div></div>
      <div class="grid g-main">
        <div class="stack">
          <div class="grid g-3">
            <div class="card kpi"><div class="label">CPU</div><div class="value">${a.cpuUtil}%</div><div class="bar"><span class="${pctClass(a.cpuUtil)}" style="width:${a.cpuUtil}%"></span></div></div>
            <div class="card kpi"><div class="label">Memory</div><div class="value">${a.memUtil}%</div><div class="bar"><span class="${pctClass(a.memUtil)}" style="width:${a.memUtil}%"></span></div></div>
            <div class="card kpi"><div class="label">Pods</div><div class="value">${a.podCount}</div><div class="sub">${a.nodes} nodes Ready</div></div>
          </div>
          <div class="card"><div class="card-h">${canManage ? '<span class="live-dot"></span>' : ''}<h3>Cluster log stream</h3><span class="hint">last ${a.logs.length} events</span></div>
            <div class="console">${a.logs.map(l => `<div><span class="ts">${fmtTime(l.ts)}</span> <span class="${l.level}">${l.level.padEnd(5)}</span> ${esc(l.msg)}</div>`).join('')}</div></div>
        </div>
        <div class="card"><div class="card-h"><h3>Asset details</h3></div><div class="card-b"><div class="fields" style="grid-template-columns:1fr 1fr">
          ${f('Asset ID', `<span class="mono">${a.id}</span>`)}${f('Team', esc(team(a.teamId).name))}
          ${f('Nodes', a.nodes)}${f('Node size', `${a.vcpu} vCPU · ${a.ramGb} GB`)}
          ${f('Disk / node', a.storageGb + ' GB')}${f('Run-rate', r ? money(R.estimateMonthlyCost(r)) + '/mo' : '—')}
          ${f('Expires', a.expiresOn ? `${fmtDate(a.expiresOn)}<div class="muted small">${rel(a.expiresOn)}</div>` : 'Never (PROD)')}${f('Status', assetTag(a.status))}
          <div style="grid-column:1/-1">${f('API endpoint', `<span class="mono small">${esc(a.endpoint)}</span>`)}</div></div></div></div>
      </div>`;
  }

  /* ============================================================= QUOTAS */
  function viewQuotas() {
    const s = S.get(), admin = role() === 'ADMIN';
    const teams = role() === 'TEAM_LEAD' ? s.teams.filter(t => user().teams.includes(t.id)) : s.teams;
    return `
      <div class="page-head"><div><h1>Quotas &amp; budgets</h1><p>Resource boundaries enforced by policies POL-003 → POL-006${admin ? ' · editable by Platform Admin' : ''}</p></div></div>
      <div class="grid g-3">${teams.map(t => {
        const q = R.quotaFor(s, t.id), u = R.teamUtilization(s, t.id);
        return `<div class="card"><div class="card-h"><h3>${esc(t.name)}</h3><span class="chip">${t.costCenter}</span><span class="spacer"></span><span class="muted small">${u.count} active</span></div>
          <div class="card-b stack" style="gap:12px">
            ${meter('vCPU', u.vcpu, q.vcpuLimit, '')}${meter('Memory', u.ramGb, q.ramLimitGb, 'GB')}${meter('Storage', u.storageGb, q.storageLimitGb, 'GB')}${meter('Monthly budget', u.spend, q.monthlyBudget, '$')}
            ${admin ? `<form class="fgrid" data-quota="${t.id}" style="border-top:1px dashed var(--line);padding-top:12px">
              <div class="field"><label>vCPU limit</label><input class="input" type="number" name="vcpuLimit" value="${q.vcpuLimit}"></div>
              <div class="field"><label>RAM limit (GB)</label><input class="input" type="number" name="ramLimitGb" value="${q.ramLimitGb}"></div>
              <div class="field"><label>Storage (GB)</label><input class="input" type="number" name="storageLimitGb" value="${q.storageLimitGb}"></div>
              <div class="field"><label>Budget ($)</label><input class="input" type="number" name="monthlyBudget" value="${q.monthlyBudget}"></div>
              <div class="full"><button class="btn sm primary" type="submit">Save quota</button></div></form>` : ''}
          </div></div>`;
      }).join('')}</div>`;
  }

  /* ============================================================== AUDIT */
  function viewAudit() {
    const f = ui.filters.audit || (ui.filters.audit = { q: '', actor: '', action: '' });
    const all = S.get().audit;
    let rows = all;
    if (f.actor) rows = rows.filter(a => a.actor === f.actor);
    if (f.action) rows = rows.filter(a => a.action === f.action);
    if (f.q) { const q = f.q.toLowerCase(); rows = rows.filter(a => (a.entityId + a.details).toLowerCase().includes(q)); }
    const uniq = k => [...new Set(all.map(a => a[k]))].sort();
    return `
      <div class="page-head"><div><h1>Audit trail</h1><p>Immutable event log (<span class="mono">MCP_AUDIT_LOG</span>) · ${rows.length} of ${all.length} events</p></div>
        <button class="btn" data-act="csv">Export CSV</button></div>
      <div class="card">
        <div class="filters">
          <input class="input" placeholder="Search entity or details…" data-filter="audit.q" value="${esc(f.q)}" style="min-width:220px">
          <select class="input" data-filter="audit.actor"><option value="">All actors</option>${uniq('actor').map(v => `<option ${v === f.actor ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>
          <select class="input" data-filter="audit.action"><option value="">All actions</option>${uniq('action').map(v => `<option ${v === f.action ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>
        </div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Event</th><th>Timestamp</th><th>Actor</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead><tbody>
          ${rows.slice(0, 200).map(a => `<tr><td class="mono small muted">${a.id}</td><td class="nowrap">${fmtDT(a.ts)}</td><td class="nowrap">${esc(a.actor)}</td><td class="mono small">${a.action}</td>
            <td class="nowrap"><span class="muted small">${a.entity}</span> ${entityLink(a.entityId)}</td><td>${esc(a.details)}</td></tr>`).join('')}
        </tbody></table></div></div>`;
  }

  /* ======================================================= INTEGRATIONS */
  function viewIntegrations() {
    const s = S.get();
    const objs = ['MCP_INT_CreateDeployment', 'MCP_INT_GetDeploymentStatus', 'MCP_INT_DeleteDeployment', 'MCP_INT_PostNotification', 'MCP_WebAPI_DeploymentCallback (inbound)'];
    const stats = objs.map(o => { const c = s.apiLog.filter(x => x.integration === o); return [o, c.length, c.length ? Math.round(c.reduce((a, x) => a + x.latencyMs, 0) / c.length) : 0]; });
    return `
      <div class="page-head"><div><h1>Integrations</h1><p>Connected system <b>MCP Orchestrator API</b> · OAuth 2.0 client credentials · base URL <span class="mono">https://orchestrator.nimbusops.internal</span></p></div>
        <div class="row"><button class="btn" data-act="sweep">Run lifecycle sweep</button><button class="btn danger" data-act="reset">Reset demo data</button></div></div>
      <div class="grid g-main">
        <div class="card"><div class="card-h"><h3>Call log</h3><span class="hint">click a row for request / response</span></div>
          <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Time</th><th>Integration</th><th>Method</th><th>Status</th><th class="num">Latency</th></tr></thead><tbody>
          ${s.apiLog.slice(0, 80).map(x => `<tr class="click" data-expand="${x.id}"><td class="nowrap muted">${fmtDT(x.ts)}</td><td><span class="mono small">${esc(x.integration)}</span><div class="muted small mono">${esc(x.endpoint.replace('https://orchestrator.nimbusops.internal', ''))}</div></td>
            <td><span class="chip">${x.method}</span></td><td><span class="tag plain ${x.status < 300 ? 't-green' : 't-red'}">${x.status}</span></td><td class="num">${x.latencyMs} ms</td></tr>
            ${ui.expanded === x.id ? `<tr><td colspan="5" style="background:#f8fafc"><div class="grid g-2"><div><div class="small muted" style="margin-bottom:4px">Request body</div><pre class="json">${esc(JSON.stringify(x.request, null, 2))}</pre></div>
              <div><div class="small muted" style="margin-bottom:4px">Response</div><pre class="json">${esc(JSON.stringify(x.response, null, 2))}</pre></div></div></td></tr>` : ''}`).join('')}
          </tbody></table></div></div>
        <div class="stack">
          <div class="card"><div class="card-h"><h3>Integration objects</h3></div><div class="card-b flush"><table class="tbl"><thead><tr><th>Object</th><th class="num">Calls</th><th class="num">Avg</th></tr></thead><tbody>
            ${stats.map(([o, c, l]) => `<tr><td class="mono small">${esc(o)}</td><td class="num">${c}</td><td class="num">${l} ms</td></tr>`).join('')}</tbody></table></div></div>
          <div class="card"><div class="card-h"><h3>Chaos testing</h3></div><div class="card-b">
            <label class="row" style="justify-content:space-between"><span><b>Force provider failure</b><div class="muted small">Next terraform apply fails → exercises the exception flow &amp; retry</div></span>
            <span class="switch"><input type="checkbox" id="chaos" ${s.chaos ? 'checked' : ''}><span></span></span></label></div></div>
        </div>
      </div>`;
  }

  /* ============================================================ BINDING */
  function bind() {
    $view.querySelectorAll('[data-go]').forEach(el => el.addEventListener('click', e => {
      if (e.target.closest('a,button')) return; location.hash = el.dataset.go;
    }));
    $view.querySelectorAll('[data-filter]').forEach(el => el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', () => {
      const [grp, key] = el.dataset.filter.split('.');
      ui.filters[grp][key] = el.value;
      const pos = el.selectionStart;
      render();
      if (el.tagName === 'INPUT') { const n = $view.querySelector(`[data-filter="${el.dataset.filter}"]`); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} } }
    }));
    $view.querySelectorAll('[data-expand]').forEach(el => el.addEventListener('click', () => {
      ui.expanded = ui.expanded === el.dataset.expand ? null : el.dataset.expand; render();
    }));
    const envSeg = $view.querySelector('[data-envfilter]');
    if (envSeg) envSeg.querySelectorAll('button').forEach(b => b.onclick = () => { ui.filters.env.status = b.dataset.v; render(); });
    const chaos = document.getElementById('chaos');
    if (chaos) chaos.onchange = () => { S.get().chaos = chaos.checked; MCP.Audit.log(user().name, chaos.checked ? 'CHAOS_ENABLED' : 'CHAOS_DISABLED', 'SYS-CHAOS', 'Force provider failure toggle'); S.emit(); toast(chaos.checked ? 'Chaos mode on — next apply will fail' : 'Chaos mode off'); };

    $view.querySelectorAll('form[data-quota]').forEach(fm => fm.onsubmit = e => {
      e.preventDefault();
      const q = R.quotaFor(S.get(), fm.dataset.quota), fd = new FormData(fm), before = Object.assign({}, q);
      ['vcpuLimit', 'ramLimitGb', 'storageLimitGb', 'monthlyBudget'].forEach(k => q[k] = Math.max(0, Number(fd.get(k)) || 0));
      MCP.Audit.log(user().name, 'QUOTA_UPDATED', 'SYS-QUOTA', `${team(q.teamId).name}: vCPU ${before.vcpuLimit}→${q.vcpuLimit}, budget $${before.monthlyBudget}→$${q.monthlyBudget}`);
      S.emit(); toast('Quota saved');
    });

    // New-request form
    const form = document.getElementById('reqForm');
    if (form) {
      form.addEventListener('input', e => {
        const el = e.target; if (!el.name) return;
        ui.form[el.name] = el.value;
        if (el.name === 'teamId') { render(); return; }
        refreshEval();
      });
      form.querySelectorAll('[data-seg]').forEach(seg => seg.querySelectorAll('button').forEach(b => b.onclick = () => {
        const k = seg.dataset.seg; ui.form[k] = b.dataset.v;
        if (k === 'provider') { const pv = C.PROVIDERS[b.dataset.v]; if (!pv.regions.includes(ui.form.region)) ui.form.region = pv.prodRegions[pv.prodRegions.length - 1]; }
        if (k === 'envType' && b.dataset.v !== 'PROD' && !(+ui.form.ttlDays)) ui.form.ttlDays = 14;
        render();
      }));
      form.querySelector('#template').addEventListener('change', e => {
        const t = C.TEMPLATES[e.target.value]; Object.assign(ui.form, { vcpu: t.vcpu, ramGb: t.ram, storageGb: t.storage, nodes: t.nodes }); render();
      });
      form.onsubmit = e => {
        e.preventDefault();
        const res = P.submit(Object.assign({}, ui.form), user());
        if (!res.ok) { toast(res.error, true); return; }
        ui.form = null;
        toast(res.route === 'AUTO' ? `${res.id} auto-approved — provisioning started` : `${res.id} submitted for ${R.ROUTE_LABEL[res.route]}`);
        location.hash = '#/request/' + res.id;
      };
      refreshEval();
    }

    $view.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', async () => {
      const id = b.dataset.id, act = b.dataset.act, u = user();
      const cmt = id ? document.getElementById('cmt-' + id) : null;
      let res;
      switch (act) {
        case 'approve': res = P.approve(id, u, cmt ? cmt.value : ''); res.ok ? toast(`${id} approved`) : toast(res.error, true); break;
        case 'reject': res = P.reject(id, u, cmt ? cmt.value : ''); res.ok ? toast(`${id} rejected`) : toast(res.error, true); break;
        case 'retry': P.retry(id, u); toast('Retry started'); break;
        case 'extend': res = P.extendTtl(id, u, 7); res.ok ? toast('TTL extended by 7 days') : toast(res.error, true); break;
        case 'decom':
          b.disabled = true; b.textContent = 'Decommissioning…';
          await P.decommission(id, u.name, 'Requested by ' + u.name); toast('Environment decommissioned'); break;
        case 'sweep': { const n = await P.lifecycleSweep(u); toast(`Lifecycle sweep complete — ${n} expired environment(s) decommissioned`); break; }
        case 'reset': S.reset(); ui.form = null; ui.filters = {}; toast('Demo data reset'); break;
        case 'csv': exportCsv(); break;
        case 'loadSample':
          ui.form = Object.assign(defaultForm(), { teamId: user().teams[0], appName: 'checkout-api', provider: 'AZURE', region: 'centralindia', envType: 'PROD',
            template: 'K8S', vcpu: 8, ramGb: 32, storageGb: 150, nodes: 3, ttlDays: 0, justification: 'Production AKS cluster for the new checkout API (Diwali sale traffic).' });
          render(); break;
        case 'resetForm': ui.form = defaultForm(); render(); break;
      }
    }));
  }

  function exportCsv() {
    const rows = [['id', 'timestamp', 'actor', 'action', 'entity', 'entityId', 'details']].concat(
      S.get().audit.map(a => [a.id, a.ts, a.actor, a.action, a.entity, a.entityId, a.details]));
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    link.download = `nimbusops-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  /* --------------------------------------------------------- live loop */
  function busy() {
    const a = document.activeElement;
    return a && $view.contains(a) && ['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName);
  }
  S.on(kind => {
    if (kind === 'user') return;
    if (ui.route === 'new') { renderChrome(); return; }
    if (busy()) { renderChrome(); return; }
    if (kind === 'health' && !['dashboard', 'environments', 'environment'].includes(ui.route)) return;
    const y = window.scrollY; render(); window.scrollTo(0, y);
  });

  window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });

  S.load();
  render();
  setInterval(() => { if (P.tick()) S.emit('process'); }, 700);
  setInterval(() => { P.healthTick(); S.emit('health'); }, 3000);
})();
