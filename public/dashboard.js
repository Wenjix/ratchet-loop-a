const feedList = document.getElementById('decision-feed-list');
const graphList = document.getElementById('coordination-graph-list');
const ledgerList = document.getElementById('policy-ledger-list');
const inboxList = document.getElementById('approval-inbox-list');

function el(tag, attrs = {}) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'text') node.textContent = value;
    else node.setAttribute(key, value);
  }
  return node;
}

// Small, unobtrusive status indicator (created here rather than in index.html
// so this fix stays scoped to dashboard.js).
const statusLine = el('span', { class: 'status-line' });
const headerEl = document.querySelector('header');
if (headerEl) headerEl.appendChild(statusLine);

function showStatus(message) {
  statusLine.textContent = message;
  statusLine.classList.add('status-error');
}

function clearStatus() {
  statusLine.textContent = '';
  statusLine.classList.remove('status-error');
}

function renderDecision(decision) {
  const li = el('li');
  li.appendChild(el('span', { class: 'agent-dot', style: `background:${decision.color}` }));
  li.appendChild(document.createTextNode(`${decision.agent.toUpperCase()} — ${decision.summary}`));
  feedList.prepend(li);
  while (feedList.children.length > 30) feedList.removeChild(feedList.lastChild);
}

function renderFlow(flow) {
  const li = el('li', { text: `${flow.from} → ${flow.to} (${flow.crossPrincipal ? 'cross-principal' : 'internal'}): ${flow.label}` });
  graphList.prepend(li);
  while (graphList.children.length > 20) graphList.removeChild(graphList.lastChild);
  setTimeout(() => li.remove(), flow.duration || 4000);
}

function renderLedger(entries) {
  ledgerList.innerHTML = '';
  for (const entry of entries) {
    const status = entry.policy?.revoked ? 'revoked' : entry.policy ? 'active' : 'proposed';
    const capText = entry.policy ? `cap $${entry.policy.cap}` : entry.pendingProposal ? `proposed cap $${entry.pendingProposal.cap}` : '';
    const li = el('li', { text: `${entry.key} — ${status} — ${capText}` });
    if (entry.policy?.revoked) li.className = 'policy-revoked';
    ledgerList.appendChild(li);
  }
}

// POST to an inbox action endpoint, refreshing on success and surfacing a
// visible error (instead of silently leaving the card in place) on failure.
function postInboxAction(url) {
  fetch(url, { method: 'POST' })
    .then((response) => {
      if (!response.ok) {
        showStatus(`Action failed (${response.status})`);
        return;
      }
      return refresh();
    })
    .catch(() => showStatus('Action failed — network error'));
}

function renderInbox(mandates, policyLedger) {
  inboxList.innerHTML = '';
  const pending = mandates.filter((m) => m.status === 'pending_approval');
  for (const mandate of pending) {
    const li = el('li');
    li.appendChild(document.createTextNode(`${mandate.task_type} → ${mandate.vendor_id}: $${mandate.amount}`));
    const actions = el('span', { class: 'inbox-actions' });
    const approveBtn = el('button', { text: 'Approve' });
    approveBtn.onclick = () => postInboxAction(`/api/mandates/${mandate.id}/approve`);
    const rejectBtn = el('button', { class: 'reject', text: 'Reject' });
    rejectBtn.onclick = () => postInboxAction(`/api/mandates/${mandate.id}/reject`);
    actions.appendChild(approveBtn);
    actions.appendChild(rejectBtn);
    li.appendChild(actions);
    inboxList.appendChild(li);
  }

  const proposedPolicies = (policyLedger || []).filter((entry) => entry.pendingProposal);
  for (const entry of proposedPolicies) {
    const li = el('li', { class: 'policy-proposal' });
    li.appendChild(document.createTextNode(
      `POLICY PROPOSAL — ${entry.key} — streak ${entry.streak} — proposed cap $${entry.pendingProposal.cap}`
    ));
    const actions = el('span', { class: 'inbox-actions' });
    const acceptBtn = el('button', { text: 'Accept' });
    acceptBtn.onclick = () => postInboxAction(`/api/policies/${encodeURIComponent(entry.key)}/accept`);
    const rejectBtn = el('button', { class: 'reject', text: 'Reject' });
    rejectBtn.onclick = () => postInboxAction(`/api/policies/${encodeURIComponent(entry.key)}/reject`);
    actions.appendChild(acceptBtn);
    actions.appendChild(rejectBtn);
    li.appendChild(actions);
    inboxList.appendChild(li);
  }
}

async function refresh() {
  try {
    const res = await fetch('/api/state');
    if (!res.ok) throw new Error(`state fetch failed: ${res.status}`);
    const state = await res.json();
    feedList.innerHTML = '';
    for (const decision of state.decisionFeed.slice(-30)) renderDecision(decision);
    renderLedger(state.policyLedger);
    renderInbox(state.mandates, state.policyLedger);
    // Hydrate the Coordination Graph from server-computed active flows so a
    // page load/reload mid-run isn't empty until the next live SSE event.
    // Reuses renderFlow — the same renderer the live coordination_flow
    // handler uses — rather than duplicating its rendering logic here.
    graphList.innerHTML = '';
    for (const flow of state.activeFlows || []) renderFlow(flow);
    clearStatus();
  } catch (err) {
    showStatus('Unable to refresh — will retry on next update');
  }
}

document.getElementById('run-scenario').addEventListener('click', () => {
  fetch('/api/scenario/run', { method: 'POST' });
});

const events = new EventSource('/api/events');
events.onmessage = (event) => {
  const { type, payload } = JSON.parse(event.data);
  if (type === 'decision') renderDecision(payload);
  if (type === 'coordination_flow') renderFlow(payload);
  if (['mandate_created', 'mandate_updated', 'policy_proposed', 'policy_accepted', 'policy_rejected', 'policy_revoked'].includes(type)) refresh();
};
// EventSource reconnects automatically on drops, but any events broadcast
// during the gap are otherwise lost. Resync full state once the connection
// issue is observed so nothing stays permanently stale.
events.onerror = () => {
  showStatus('Connection interrupted — resyncing');
  refresh();
};

refresh();
