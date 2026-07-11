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

function renderInbox(mandates) {
  inboxList.innerHTML = '';
  const pending = mandates.filter((m) => m.status === 'pending_approval');
  for (const mandate of pending) {
    const li = el('li');
    li.appendChild(document.createTextNode(`${mandate.task_type} → ${mandate.vendor_id}: $${mandate.amount}`));
    const actions = el('span', { class: 'inbox-actions' });
    const approveBtn = el('button', { text: 'Approve' });
    approveBtn.onclick = () => fetch(`/api/mandates/${mandate.id}/approve`, { method: 'POST' }).then(refresh);
    const rejectBtn = el('button', { class: 'reject', text: 'Reject' });
    rejectBtn.onclick = () => fetch(`/api/mandates/${mandate.id}/reject`, { method: 'POST' }).then(refresh);
    actions.appendChild(approveBtn);
    actions.appendChild(rejectBtn);
    li.appendChild(actions);
    inboxList.appendChild(li);
  }
}

async function refresh() {
  const res = await fetch('/api/state');
  const state = await res.json();
  feedList.innerHTML = '';
  for (const decision of state.decisionFeed.slice(-30).reverse()) renderDecision(decision);
  renderLedger(state.policyLedger);
  renderInbox(state.mandates);
}

document.getElementById('run-scenario').addEventListener('click', () => {
  fetch('/api/scenario/run', { method: 'POST' });
});

const events = new EventSource('/api/events');
events.onmessage = (event) => {
  const { type, payload } = JSON.parse(event.data);
  if (type === 'decision') renderDecision(payload);
  if (type === 'coordination_flow') renderFlow(payload);
  if (['mandate_created', 'mandate_updated', 'policy_proposed', 'policy_accepted', 'policy_revoked'].includes(type)) refresh();
};

refresh();
