// Backend API is proxied through nginx on the same hostname
const API_BASE = '/api';

// Main app state
let currentView = 'hubs';
let selectedHub = null;
let rhacmInstalled = true; // v4: Environment flag

// Utility: count unique nodes by hostname
function getNodeCount(nodesInfo) {
    const hostnames = new Set();
    (nodesInfo || []).forEach(node => hostnames.add(node.name.split('.')[0]));
    return hostnames.size;
}

// Utility: escape a string for use in HTML attributes
function escapeAttr(str) {
    return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Utility: debounce function calls
function debounce(fn, delay) {
    let timer;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

// Utility: render a hub card's HTML (shared by all hub list views)
function renderHubCardHTML(hub, options = {}) {
    const { showDelete = false, showRefresh = true } = options;
    const statusClass = (hub.status.toLowerCase().includes('ready') || hub.status.toLowerCase().includes('connected')) ? 'ready' : (hub.status.toLowerCase() === 'unknown' ? 'unknown' : 'notready');
    const spokeCount = hub.managedClusters?.length || 0;
    const policyCount = hub.policiesInfo?.length || 0;
    const nodeCount = getNodeCount(hub.nodesInfo);
    const safeName = escapeAttr(hub.name);

    let html = `
        <div class="card" data-hub="${safeName}">
            <div class="card__title">
                <span>${hub.name}</span>
                <span class="status status--${statusClass}">${hub.status}</span>
            </div>
            <div class="info-row">
                <span class="info-row__label">OpenShift Version:</span>
                <span class="info-row__value">${hub.clusterInfo.openshiftVersion || 'N/A'}</span>
            </div>
            <div class="info-row">
                <span class="info-row__label">Kubernetes:</span>
                <span class="info-row__value">${hub.version || 'N/A'}</span>
            </div>
            ${hub.clusterInfo.region ? `
            <div class="info-row">
                <span class="info-row__label">Configuration:</span>
                <span class="info-row__value"><code class="config-badge">${hub.clusterInfo.region}</code></span>
            </div>
            ` : ''}
            <div class="info-row">
                <span class="info-row__label">Nodes:</span>
                <span class="info-row__value"><span class="badge">${nodeCount}</span></span>
            </div>
            ${policyCount > 0 ? `
            <div class="info-row">
                <span class="info-row__label">Policies:</span>
                <span class="info-row__value"><span class="badge badge--green">${policyCount}</span></span>
            </div>
            ` : ''}
            <div class="info-row">
                <span class="info-row__label">Spoke Clusters:</span>
                <span class="info-row__value"><span class="badge">${spokeCount}</span></span>
            </div>
            ${hub.clusterInfo.consoleURL || hub.clusterInfo.gitopsURL ? `
            <div class="info-row info-row--links">
                ${hub.clusterInfo.consoleURL ? `<a href="${hub.clusterInfo.consoleURL}" target="_blank" class="console-link">Console</a>` : '<span></span>'}
                ${hub.clusterInfo.gitopsURL ? `<a href="${hub.clusterInfo.gitopsURL}" target="_blank" class="console-link">GitOps</a>` : '<span></span>'}
            </div>
            ` : ''}
            <div class="hub-actions">
                ${showRefresh ? `<button class="btn btn--secondary btn--icon" onclick="refreshHub('${safeName}')" title="Refresh this hub">Refresh</button>` : ''}
                ${showDelete ? `<button class="btn btn--secondary btn--icon" onclick="removeHub('${safeName}')" title="Remove this hub">Delete</button>` : ''}
                <button class="btn btn--primary btn--full" onclick="showHubDetails('${safeName}')">
                    View Details
                </button>
            </div>
        </div>`;
    return html;
}

// Fetch and display all hubs
async function fetchHubs() {
    currentView = 'hubs';
    const app = document.getElementById('app');
    app.innerHTML = '<div class="loading"><div class="loading__spinner"></div><p>Loading hubs...</p></div>';

    try {
        const response = await fetch(`${API_BASE}/hubs`);
        const data = await response.json();
        if (data.success) {
            const hubs = data.data || [];
            if (hubs.length === 0) {
                renderNoHubsState();
            } else {
                window.cachedHubsData = hubs;
                renderHubsList(hubs);
            }
        } else {
            showError(data.error || 'Failed to load hubs');
        }
    } catch (error) {
        showError('Error connecting to API: ' + error.message);
    }
}

// Render hubs list view - table-based drill-down layout
function renderHubsList(hubs) {
    const totalSpokes = hubs.reduce((sum, hub) => sum + (hub.managedClusters?.length || 0), 0);
    const healthyHubs = hubs.filter(h => h.status.toLowerCase().includes('ready') || h.status.toLowerCase().includes('connected')).length;

    const managedHubs = hubs.filter(h => h.annotations?.source !== 'manual');
    const unmanagedHubs = hubs.filter(h => h.annotations?.source === 'manual');

    let html = `
        <div class="grid grid--stats">
            <div class="card stat-card">
                <div class="stat-card__label">Total Hubs</div>
                <div class="stat-card__number">${hubs.length}</div>
                <small class="stat-card__detail">${healthyHubs} Ready / ${hubs.length - healthyHubs} Not Ready</small>
            </div>
            <div class="card stat-card">
                <div class="stat-card__label">Total Spokes</div>
                <div class="stat-card__number">${totalSpokes}</div>
                <small class="stat-card__detail">Across all hubs</small>
            </div>
            <div class="card stat-card">
                <div class="stat-card__label">Managed Hubs</div>
                <div class="stat-card__number">${managedHubs.length}</div>
                <small class="stat-card__detail">Discovered via RHACM</small>
            </div>
            <div class="card stat-card">
                <div class="stat-card__label">External Hubs</div>
                <div class="stat-card__number">${unmanagedHubs.length}</div>
                <small class="stat-card__detail">Added manually</small>
            </div>
        </div>

        <div class="section-toolbar">
            <div class="filter-bar">
                <input type="text" class="filter-bar__input" placeholder="Filter hubs by name..." oninput="filterHubsTable(this.value)">
            </div>
            <button class="btn btn--primary" onclick="showAddHubForm()">Add Hub</button>
        </div>
    `;

    if (hubs.length === 0) {
        html += `
            <div class="card card--muted card--centered">
                <h3 class="empty-state__title">No Hubs Configured</h3>
                <p class="empty-state__text">Add your first hub to start monitoring.</p>
                <button class="btn btn--primary" onclick="showAddHubForm()">Add Your First Hub</button>
            </div>
        `;
    } else {
        html += `
            <div class="card">
                <table class="data-table" id="hubs-table">
                    <thead>
                        <tr>
                            <th>Hub Name</th>
                            <th>Type</th>
                            <th>Status</th>
                            <th>OpenShift</th>
                            <th>Spokes</th>
                            <th>Nodes</th>
                            <th>Links</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        hubs.forEach(hub => {
            const statusClass = (hub.status.toLowerCase().includes('ready') || hub.status.toLowerCase().includes('connected')) ? 'ready' : (hub.status.toLowerCase() === 'unknown' ? 'unknown' : 'notready');
            const spokeCount = hub.managedClusters?.length || 0;
            const nodeCount = getNodeCount(hub.nodesInfo);
            const safeName = escapeAttr(hub.name);
            const isManual = hub.annotations?.source === 'manual';

            html += `
                <tr class="hub-row" data-hub-name="${safeName}" onclick="showHubDetails('${safeName}')" style="cursor:pointer">
                    <td><strong>${hub.name}</strong></td>
                    <td><span class="badge ${isManual ? 'badge--muted' : 'badge--blue'}">${isManual ? 'External' : 'Managed'}</span></td>
                    <td><span class="status status--${statusClass}">${hub.status}</span></td>
                    <td>${hub.clusterInfo?.openshiftVersion || 'N/A'}</td>
                    <td><span class="badge">${spokeCount}</span></td>
                    <td>${nodeCount}</td>
                    <td onclick="event.stopPropagation()">
                        ${hub.clusterInfo?.consoleURL ? `<a href="${hub.clusterInfo.consoleURL}" target="_blank" class="console-link">Console</a>` : ''}
                        ${hub.clusterInfo?.gitopsURL ? `<a href="${hub.clusterInfo.gitopsURL}" target="_blank" class="console-link">GitOps</a>` : ''}
                    </td>
                    <td onclick="event.stopPropagation()">
                        <button class="btn btn--secondary btn--sm" onclick="refreshHub('${safeName}')">Refresh</button>
                        ${isManual ? `<button class="btn btn--secondary btn--sm" onclick="removeHub('${safeName}')">Delete</button>` : ''}
                    </td>
                </tr>
            `;
        });

        html += '</tbody></table></div>';
    }

    document.getElementById('app').innerHTML = html;
}

// Filter hubs table by name
function filterHubsTable(query) {
    const rows = document.querySelectorAll('#hubs-table .hub-row');
    const q = query.toLowerCase();
    rows.forEach(row => {
        const name = row.getAttribute('data-hub-name').toLowerCase();
        row.style.display = name.includes(q) ? '' : 'none';
    });
}

// Show hub details
async function showHubDetails(hubName) {
    selectedHub = hubName;
    currentView = 'hubDetail';
    const app = document.getElementById('app');
    app.innerHTML = '<div class="loading"><div class="loading__spinner"></div><p>Loading hub details...</p></div>';

    try {
        const response = await fetch(`${API_BASE}/hubs/${hubName}`);
        const data = await response.json();
        if (data.success && data.data) {
            renderHubDetails(data.data);
        } else {
            showError(data.error || 'Failed to load hub details');
        }
    } catch (error) {
        showError('Error: ' + error.message);
    }
}

// Render hub details view
function renderHubDetails(hub) {
    const statusClass = hub.status.toLowerCase().includes('ready') || hub.status.toLowerCase().includes('connected') ? 'ready' : 'notready';
    const spokeCount = hub.managedClusters?.length || 0;
    const policyCount = hub.policiesInfo?.length || 0;
    const nodeCount = getNodeCount(hub.nodesInfo);

    const uniqueOperatorNames = new Set();
    (hub.operatorsInfo || []).forEach(op => { uniqueOperatorNames.add(op.displayName || op.name); });
    const uniqueOperatorCount = uniqueOperatorNames.size;

    let html = `
        <button class="back-button" onclick="returnToHomepage()">← Back to Hubs</button>

        <h2 class="section-heading section-heading--flex">
            ${hub.name}
            <span class="status status--${statusClass}">${hub.status}</span>
        </h2>

        <div class="tabs">
            <button class="tabs__item tabs__item--active" onclick="switchTab(0, '${hub.name}')">Overview</button>
            <button class="tabs__item" onclick="switchTab(1, '${hub.name}')">Nodes (${nodeCount})</button>
            ${(hub.annotations?.source !== 'manual' || policyCount > 0) ? `<button class="tabs__item" onclick="switchTab(2, '${hub.name}')">Policies (${policyCount})</button>` : ''}
            <button class="tabs__item" onclick="switchTab(${hub.annotations?.source === 'manual' && policyCount === 0 ? 2 : 3}, '${hub.name}')">Operators (${uniqueOperatorCount})</button>
            <button class="tabs__item" onclick="switchTab(${hub.annotations?.source === 'manual' && policyCount === 0 ? 3 : 4}, '${hub.name}')">Spoke Clusters (${spokeCount})</button>
        </div>

        <div class="tab-content tab-content--active" id="tab-0">
            ${renderHubOverview(hub)}
        </div>

        <div class="tab-content" id="tab-1">
            ${renderNodes(hub.nodesInfo || [])}
        </div>

        ${(hub.annotations?.source !== 'manual' || policyCount > 0) ? `
        <div class="tab-content" id="tab-2">
            ${renderPolicies(hub.policiesInfo || [])}
        </div>
        ` : ''}

        <div class="tab-content" id="tab-${hub.annotations?.source === 'manual' && policyCount === 0 ? 2 : 3}">
            ${renderOperators(hub.operatorsInfo || [])}
        </div>

        <div class="tab-content" id="tab-${hub.annotations?.source === 'manual' && policyCount === 0 ? 3 : 4}">
            ${renderSpokes(hub.managedClusters || [], hub.name)}
        </div>
    `;

    document.getElementById('app').innerHTML = html;
}

// Render hub overview
function renderHubOverview(hub) {
    const overviewStatusClass = hub.status.toLowerCase().includes('ready') || hub.status.toLowerCase().includes('connected') ? 'ready' : 'notready';
    return `
        <div class="card">
            <div class="card__title">Cluster Information</div>
            <div class="info-row"><span class="info-row__label">Name:</span> <span class="info-row__value">${hub.name}</span></div>
            <div class="info-row"><span class="info-row__label">Status:</span> <span class="info-row__value"><span class="status status--${overviewStatusClass}">${hub.status}</span></span></div>
            <div class="info-row"><span class="info-row__label">Kubernetes Version:</span> <span class="info-row__value">${hub.version || 'N/A'}</span></div>
            <div class="info-row"><span class="info-row__label">OpenShift Version:</span> <span class="info-row__value">${hub.clusterInfo.openshiftVersion || 'N/A'}</span></div>
            <div class="info-row"><span class="info-row__label">Platform:</span> <span class="info-row__value">${hub.clusterInfo.platform || 'N/A'}</span></div>
            ${hub.clusterInfo.region ? `
            <div class="info-row">
                <span class="info-row__label">Configuration Version:</span>
                <span class="info-row__value"><strong class="config-badge">${hub.clusterInfo.region}</strong></span>
            </div>
            ` : ''}
            <div class="info-row"><span class="info-row__label">Cluster ID:</span> <span class="info-row__value"><small class="mono mono--sm">${hub.clusterInfo.clusterID}</small></span></div>
            ${hub.clusterInfo.consoleURL ? `
            <div class="info-row">
                <span class="info-row__label">Console URL:</span>
                <span class="info-row__value"><a href="${hub.clusterInfo.consoleURL}" target="_blank">${hub.clusterInfo.consoleURL}</a></span>
            </div>
            ` : ''}
            ${hub.clusterInfo.gitopsURL ? `
            <div class="info-row">
                <span class="info-row__label">GitOps Console:</span>
                <span class="info-row__value"><a href="${hub.clusterInfo.gitopsURL}" target="_blank">${hub.clusterInfo.gitopsURL}</a></span>
            </div>
            ` : ''}
            <div class="info-row"><span class="info-row__label">Created:</span> <span class="info-row__value">${new Date(hub.createdAt).toLocaleString()}</span></div>
        </div>
    `;
}

// Cache spoke brief data for lazy load detail rendering
let cachedSpokes = {};

// Render spoke clusters - table view for scalability
function renderSpokes(spokes, hubName) {
    cachedSpokes = {};
    spokes.forEach((spoke, i) => { cachedSpokes[i] = spoke; });
    if (spokes.length === 0) {
        return '<div class="empty-state"><div class="empty-state__icon">📦</div><p>No spoke clusters found for this hub</p></div>';
    }

    let html = `
        <div class="card filter-bar">
            <div class="filter-bar__row--spokes">
                <div>
                    <label class="filter-bar__label">Search by Cluster Name</label>
                    <input type="text" id="search-cluster-name" placeholder="Enter cluster name..."
                           class="filter-bar__input"
                           onkeyup="filterSpokes()">
                </div>
                <div>
                    <label class="filter-bar__label">Search by Version</label>
                    <input type="text" id="search-version" placeholder="e.g., 4.18.13..."
                           class="filter-bar__input"
                           onkeyup="filterSpokes()">
                </div>
                <div>
                    <label class="filter-bar__label">Search by Configuration</label>
                    <input type="text" id="search-configuration" placeholder="e.g., vdu2-4.18..."
                           class="filter-bar__input"
                           onkeyup="filterSpokes()">
                </div>
                <div>
                    <button class="btn btn--secondary" onclick="clearSpokeSearch()">
                        Clear
                    </button>
                </div>
            </div>
            <div id="spoke-count" class="filter-bar__count">
                Showing ${spokes.length} spoke cluster${spokes.length !== 1 ? 's' : ''}
            </div>
        </div>

        <div class="card">
            <table id="spokes-table">
                <thead>
                    <tr>
                        <th>Cluster Name</th>
                        <th>Status</th>
                        <th>OpenShift</th>
                        <th>Configuration</th>
                        <th>Policies</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
    `;

    spokes.forEach((spoke, spokeIndex) => {
        const status = spoke.status.toLowerCase();
        const statusClass = status === 'ready' ? 'ready' : (status === 'unknown' ? 'unknown' : 'notready');
        const spokeDetailId = `spoke-detail-${spokeIndex}`;

        html += `
            <tr class="spoke-row" data-cluster-name="${spoke.name.toLowerCase()}" data-version="${(spoke.clusterInfo.openshiftVersion || '').toLowerCase()}" data-configuration="${(spoke.clusterInfo.region || '').toLowerCase()}">
                <td><strong>${spoke.name}</strong></td>
                <td><span class="status status--${statusClass}">${spoke.status}</span></td>
                <td>${spoke.clusterInfo.openshiftVersion || 'N/A'}</td>
                <td><code class="config-badge">${spoke.clusterInfo.region || 'N/A'}</code></td>
                <td id="spoke-policies-${spokeIndex}"><span class="badge badge--muted">-</span></td>
                <td>
                    <button class="btn btn--primary btn--sm" onclick="toggleSpokeDetails('${spokeDetailId}', '${hubName}', '${spoke.name}', ${spokeIndex})">
                        Details
                    </button>
                </td>
            </tr>
            <tr id="${spokeDetailId}" class="data-table__detail-row" style="display: none;">
                <td colspan="6" class="data-table__detail-cell--flush">
                    <div class="spoke-detail-loading">Loading spoke details...</div>
                </td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
    `;
    return html;
}

// Toggle spoke details visibility and lazy load spoke data
async function toggleSpokeDetails(id, hubName, spokeName, spokeIndex) {
    const element = document.getElementById(id);
    if (!element) return;

    if (element.style.display !== 'none') {
        element.style.display = 'none';
        return;
    }

    element.style.display = 'table-row';

    // Skip if already loaded
    if (element.dataset.loaded) return;
    element.dataset.loaded = 'true';

    const detailCell = element.querySelector('td');

    try {
        // Fetch spoke detail (policies + nodes) and operators in parallel
        const [detailRes, operatorsRes] = await Promise.all([
            fetch(`${API_BASE}/hubs/${hubName}/spokes/${spokeName}`),
            fetch(`${API_BASE}/hubs/${hubName}/spokes/${spokeName}/operators`)
        ]);
        const detailData = await detailRes.json();
        const operatorsData = await operatorsRes.json();

        const spoke = detailData.success ? detailData.data : { policiesInfo: [], nodesInfo: [] };
        const operators = operatorsData.success ? operatorsData.data : [];
        const policies = spoke.policiesInfo || [];

        // Update the policy count in the table row
        const policyCell = document.getElementById(`spoke-policies-${spokeIndex}`);
        if (policyCell) {
            const compliant = policies.filter(p => p.complianceState === 'Compliant').length;
            const allOk = policies.length === 0 || compliant === policies.length;
            policyCell.innerHTML = `<span class="badge ${allOk ? 'badge--green' : ''}">${compliant}/${policies.length}</span>`;
        }

        // Build the spoke detail content with loaded data
        const briefSpoke = cachedSpokes[spokeIndex] || {};
        detailCell.innerHTML = renderSpokeDetailsLazy(spokeName, hubName, policies, spoke.nodesInfo || [], operators || [], briefSpoke);
    } catch (error) {
        detailCell.innerHTML = `<div class="spoke-detail"><p>Error loading spoke details: ${error.message}</p></div>`;
    }
}

// Render spoke details after lazy loading policies, nodes, and operators
function renderSpokeDetailsLazy(spokeName, hubName, policies, nodes, operators, briefSpoke) {
    const policyCount = policies.length;
    const compliantPolicies = policies.filter(p => p.complianceState === 'Compliant').length;
    const policiesOk = policyCount === 0 || compliantPolicies === policyCount;
    const labels = briefSpoke?.labels || {};
    const clusterInfo = briefSpoke?.clusterInfo || {};

    const operatorMap = new Map();
    operators.forEach(op => {
        const key = op.displayName || op.name;
        if (!operatorMap.has(key)) {
            operatorMap.set(key, { displayName: key, version: op.version, namespaces: [], phase: op.phase });
        }
        operatorMap.get(key).namespaces.push(op.namespace);
    });
    const uniqueOperators = Array.from(operatorMap.values());

    // Build labels display
    const labelEntries = Object.entries(labels).filter(([k]) => !k.startsWith('open-cluster-management.io/'));
    const labelsHtml = labelEntries.length > 0
        ? labelEntries.map(([k, v]) => `<span class="badge badge--muted">${k}=${v}</span>`).join(' ')
        : '<span class="data-table__cell--muted">No labels</span>';

    let html = `<div id="spoke-detail-${spokeName}" class="spoke-detail">
        <div class="tabs">
            <button class="spoke-tabs__item spoke-tabs__item--active" onclick="switchSpokeTab(null, 0, '${spokeName}')">Overview</button>
            <button class="spoke-tabs__item" onclick="switchSpokeTab(null, 1, '${spokeName}')">Operators (${uniqueOperators.length})</button>
            <button class="spoke-tabs__item" onclick="switchSpokeTab(null, 2, '${spokeName}')">Policies (${policyCount})</button>
        </div>

        <div class="spoke-tab-content spoke-tab-content--active">
            <div class="grid grid--4col">
                <div class="spoke-stat-card">
                    <div class="spoke-stat-card__label">Nodes</div>
                    <div class="spoke-stat-card__value">${nodes.length}</div>
                </div>
                <div class="spoke-stat-card spoke-stat-card--operators">
                    <div class="spoke-stat-card__label spoke-stat-card__label--blue">Operators</div>
                    <div class="spoke-stat-card__value spoke-stat-card__value--lg spoke-stat-card__value--blue">${uniqueOperators.length}</div>
                </div>
                <div class="spoke-stat-card ${policiesOk ? 'spoke-stat-card--policies-ok' : 'spoke-stat-card--policies-warn'}">
                    <div class="spoke-stat-card__label ${policiesOk ? 'spoke-stat-card__label--ok' : 'spoke-stat-card__label--warn'}">Policies</div>
                    <div class="spoke-stat-card__value spoke-stat-card__value--lg ${policiesOk ? 'spoke-stat-card__value--ok' : 'spoke-stat-card__value--warn'}">${compliantPolicies}/${policyCount}</div>
                </div>
            </div>
            <div class="card" style="margin-top:var(--space-md)">
                <div class="card__title">Cluster Information</div>
                <div class="info-row"><span class="info-row__label">Platform:</span> <span class="info-row__value">${clusterInfo.platform || 'N/A'}</span></div>
                <div class="info-row"><span class="info-row__label">OpenShift:</span> <span class="info-row__value">${clusterInfo.openshiftVersion || 'N/A'}</span></div>
                <div class="info-row"><span class="info-row__label">Kubernetes:</span> <span class="info-row__value">${briefSpoke?.version || 'N/A'}</span></div>
                <div class="info-row"><span class="info-row__label">Configuration:</span> <span class="info-row__value">${clusterInfo.region || 'N/A'}</span></div>
                ${clusterInfo.consoleURL ? `<div class="info-row"><span class="info-row__label">Console:</span> <span class="info-row__value"><a href="${clusterInfo.consoleURL}" target="_blank" class="console-link">${clusterInfo.consoleURL}</a></span></div>` : ''}
                <div class="info-row"><span class="info-row__label">Labels:</span> <span class="info-row__value">${labelsHtml}</span></div>
            </div>
            ${nodes.length > 0 ? `<div><h4 class="spoke-detail__hardware-title">Hardware Inventory</h4>${renderSpokeHardwareCompact(nodes)}</div>` : ''}
        </div>

        <div class="spoke-tab-content">
            ${uniqueOperators.length > 0 ? `
            <table class="data-table data-table--sm">
                <thead><tr><th>Operator</th><th>Version</th><th>Namespace</th><th>Status</th></tr></thead>
                <tbody>
                    ${uniqueOperators.map(op => `
                        <tr>
                            <td><strong>${op.displayName}</strong></td>
                            <td><code class="config-badge config-badge--sm">${op.version || 'N/A'}</code></td>
                            <td class="data-table__cell--muted">${op.namespaces.length === 1 ? op.namespaces[0] : `<span class="badge badge--sm">${op.namespaces.length} ns</span>`}</td>
                            <td><span class="status status--${op.phase === 'Succeeded' ? 'ready' : 'notready'} status--sm">${op.phase || 'Unknown'}</span></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>` : '<p class="spoke-detail__no-data">No operators installed</p>'}
        </div>

        <div class="spoke-tab-content">
            ${policyCount > 0 ? renderSpokePolicyList(policies, hubName, spokeName) : '<p class="spoke-detail__no-data">No policies</p>'}
        </div>
    </div>`;

    return html;
}


// v4: Switch spoke tabs
function switchSpokeTab(spokeIndex, tabIndex, spokeName) {
    const spokeContainer = document.getElementById(`spoke-detail-${spokeName}`);
    if (!spokeContainer) return;

    spokeContainer.querySelectorAll('.spoke-tabs__item').forEach(tab => tab.classList.remove('spoke-tabs__item--active'));
    spokeContainer.querySelectorAll('.spoke-tab-content').forEach(content => {
        content.classList.remove('spoke-tab-content--active');
        content.style.display = 'none';
    });

    const tabs = spokeContainer.querySelectorAll('.spoke-tabs__item');
    const contents = spokeContainer.querySelectorAll('.spoke-tab-content');
    if (tabs[tabIndex]) tabs[tabIndex].classList.add('spoke-tabs__item--active');
    if (contents[tabIndex]) {
        contents[tabIndex].classList.add('spoke-tab-content--active');
        contents[tabIndex].style.display = 'block';
    }
}


// Filter spoke clusters based on search criteria
function filterSpokes() {
    const nameSearch = document.getElementById('search-cluster-name')?.value.toLowerCase() || '';
    const versionSearch = document.getElementById('search-version')?.value.toLowerCase() || '';
    const configSearch = document.getElementById('search-configuration')?.value.toLowerCase() || '';

    const rows = document.querySelectorAll('.spoke-row');
    let visibleCount = 0;

    rows.forEach(row => {
        const clusterName = row.getAttribute('data-cluster-name') || '';
        const version = row.getAttribute('data-version') || '';
        const configuration = row.getAttribute('data-configuration') || '';

        const nameMatch = !nameSearch || clusterName.includes(nameSearch);
        const versionMatch = !versionSearch || version.includes(versionSearch);
        const configMatch = !configSearch || configuration.includes(configSearch);

        if (nameMatch && versionMatch && configMatch) {
            row.style.display = '';
            visibleCount++;
        } else {
            row.style.display = 'none';
            const detailRow = row.nextElementSibling;
            if (detailRow && detailRow.classList.contains('data-table__detail-row')) {
                detailRow.style.display = 'none';
            }
        }
    });

    const countEl = document.getElementById('spoke-count');
    if (countEl) {
        const total = rows.length;
        if (visibleCount === total) {
            countEl.textContent = `Showing ${total} spoke cluster${total !== 1 ? 's' : ''}`;
        } else {
            countEl.textContent = `Showing ${visibleCount} of ${total} spoke cluster${total !== 1 ? 's' : ''}`;
        }
    }
}

// Clear spoke search filters
function clearSpokeSearch() {
    document.getElementById('search-cluster-name').value = '';
    document.getElementById('search-version').value = '';
    const configInput = document.getElementById('search-configuration');
    if (configInput) configInput.value = '';
    filterSpokes();
}

// Filter policies based on search criteria
function filterPolicies() {
    const nameSearch = document.getElementById('search-policy-name')?.value.toLowerCase() || '';
    const selectedRadio = document.querySelector('input[name="compliance-filter"]:checked');
    const complianceFilter = selectedRadio?.value.toLowerCase() || '';

    const rows = document.querySelectorAll('.policy-row');
    let visibleCount = 0;

    rows.forEach(row => {
        const policyName = row.getAttribute('data-policy-name') || '';
        const compliance = row.getAttribute('data-compliance') || '';

        const nameMatch = !nameSearch || policyName.includes(nameSearch);
        const complianceMatch = !complianceFilter || compliance.includes(complianceFilter);

        if (nameMatch && complianceMatch) {
            row.style.display = '';
            visibleCount++;
        } else {
            row.style.display = 'none';
            const detailRow = row.nextElementSibling;
            if (detailRow && detailRow.classList.contains('data-table__detail-row')) {
                detailRow.style.display = 'none';
            }
        }
    });

    const countEl = document.getElementById('policy-count');
    if (countEl) {
        const total = rows.length;
        countEl.textContent = visibleCount === total
            ? `Showing ${total} ${total !== 1 ? 'policies' : 'policy'}`
            : `Showing ${visibleCount} of ${total} ${total !== 1 ? 'policies' : 'policy'}`;
    }
}

// Clear policy search filters
function clearPolicySearch() {
    const nameInput = document.getElementById('search-policy-name');
    const allRadio = document.querySelector('input[name="compliance-filter"][value=""]');
    if (nameInput) nameInput.value = '';
    if (allRadio) allRadio.checked = true;
    filterPolicies();
}

// Filter spoke policies in detail view (v4: unique per spoke)
function filterSpokePolicies(spokeName) {
    const nameSearch = document.getElementById(`search-spoke-policy-name-${spokeName}`)?.value.toLowerCase() || '';
    const selectedRadio = document.querySelector(`input[name="spoke-compliance-filter-${spokeName}"]:checked`);
    const complianceFilter = selectedRadio?.value.toLowerCase() || '';

    const spokeContainer = document.getElementById(`spoke-detail-${spokeName}`);
    if (!spokeContainer) return;

    const rows = spokeContainer.querySelectorAll('.spoke-policy-row');
    let visibleCount = 0;

    rows.forEach(row => {
        const policyName = row.getAttribute('data-policy-name') || '';
        const compliance = row.getAttribute('data-compliance') || '';

        const nameMatch = !nameSearch || policyName.includes(nameSearch);
        const complianceMatch = !complianceFilter || compliance.includes(complianceFilter);

        if (nameMatch && complianceMatch) {
            row.style.display = '';
            visibleCount++;
        } else {
            row.style.display = 'none';
        }
    });

    const countEl = document.getElementById(`spoke-policy-count-${spokeName}`);
    if (countEl) {
        const total = rows.length;
        if (visibleCount === total) {
            countEl.textContent = `Showing ${total} ${total !== 1 ? 'policies' : 'policy'}`;
        } else {
            countEl.textContent = `Showing ${visibleCount} of ${total} ${total !== 1 ? 'policies' : 'policy'}`;
        }
    }
}

// Clear spoke policy search filters (v4: unique per spoke)
function clearSpokePolicySearch(spokeName) {
    const nameInput = document.getElementById(`search-spoke-policy-name-${spokeName}`);
    const allRadio = document.querySelector(`input[name="spoke-compliance-filter-${spokeName}"][value=""]`);
    if (nameInput) nameInput.value = '';
    if (allRadio) allRadio.checked = true;
    filterSpokePolicies(spokeName);
}

// Enforce policy by creating a ClusterGroupUpgrade
async function enforcePolicyWithCGU(policy, hubName) {
    try {
        const clusterName = policy.namespace;
        const confirm = window.confirm(
            `Create ClusterGroupUpgrade to enforce policy?\n\n` +
            `Cluster: ${clusterName}\n` +
            `Policy: ${policy.name}\n` +
            `Current State: ${policy.complianceState}\n\n` +
            `This will create a CGU resource to remediate the policy.`
        );

        if (!confirm) return;

        const response = await fetch(`${API_BASE}/cgu/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                clusterName: clusterName,
                policyName: policy.name,
                namespace: clusterName,
                hubName: hubName || clusterName
            })
        });

        const data = await response.json();

        if (data.success) {
            alert(
                `ClusterGroupUpgrade created successfully!\n\n` +
                `CGU Name: ${data.data.cguName}\n` +
                `Namespace: ${data.data.namespace}\n` +
                `Cluster: ${data.data.cluster}\n` +
                `Policy: ${data.data.policy}\n\n` +
                `The policy will be enforced via TALM.`
            );
        } else {
            alert('Failed to create CGU: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        alert('Error creating CGU: ' + error.message);
    }
}

// Download policy as YAML from the cluster
async function downloadPolicyYAML(policy, hubName) {
    try {
        let url = `${API_BASE}/policies/${policy.namespace}/${policy.name}/yaml`;
        if (hubName) {
            url += `?hub=${hubName}`;
        }

        const response = await fetch(url);

        if (!response.ok) {
            alert('Failed to download policy YAML: ' + response.statusText);
            return;
        }

        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = `${policy.namespace}_${policy.name}.yaml`;
        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
            if (filenameMatch && filenameMatch[1]) {
                filename = filenameMatch[1];
            }
        }

        const yamlContent = await response.text();
        const blob = new Blob([yamlContent], { type: 'text/yaml' });
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
        alert('Error downloading policy: ' + error.message);
    }
}

// Toggle spoke policies visibility
function toggleSpokePolicies(id) {
    const element = document.getElementById(id);
    if (element) {
        element.style.display = element.style.display === 'none' ? 'block' : 'none';
    }
}

// Toggle spoke policy details
function toggleSpokePolicyDetails(id) {
    const element = document.getElementById(id);
    if (element) {
        element.style.display = element.style.display === 'none' ? 'table-row' : 'none';
    }
}

// Render spoke policy list (compact version) - v4: unique IDs per spoke
function renderSpokePolicyList(policies, hubName, spokeName) {
    if (policies.length === 0) return '<p>No policies</p>';

    const sortedPolicies = [...policies].sort((a, b) => {
        const waveA = parseInt(a.annotations?.['ran.openshift.io/ztp-deploy-wave'] || '999');
        const waveB = parseInt(b.annotations?.['ran.openshift.io/ztp-deploy-wave'] || '999');
        return waveA - waveB;
    });

    let html = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Policy</th>
                    <th>Compliance</th>
                    <th>Remediation</th>
                    <th>Wave</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
    `;

    sortedPolicies.forEach((policy, index) => {
        const complianceClass = policy.complianceState?.toLowerCase() === 'compliant' ? 'policy-badge--compliant' : 'policy-badge--noncompliant';
        const remediationClass = policy.remediationAction === 'enforce' ? 'policy-badge--enforce' : 'policy-badge--inform';
        const ztpWave = policy.annotations?.['ran.openshift.io/ztp-deploy-wave'] || 'N/A';
        const spokePolicyDetailId = `spoke-policy-detail-${spokeName}-${index}`;

        html += `
            <tr class="spoke-policy-row" data-policy-name="${policy.name.toLowerCase()}" data-compliance="${(policy.complianceState || '').toLowerCase()}">
                <td><strong>${policy.name}</strong></td>
                <td><span class="policy-badge ${complianceClass}">${policy.complianceState || 'Unknown'}</span></td>
                <td><span class="policy-badge ${remediationClass}">${policy.remediationAction || 'N/A'}</span></td>
                <td><span class="badge badge--wave">${ztpWave}</span></td>
                <td>
                    <button class="btn btn--secondary btn--xs" onclick="toggleSpokePolicyDetails('${spokePolicyDetailId}')">
                        Details
                    </button>
                    <button class="btn btn--primary btn--xs" onclick='downloadPolicyYAML(${JSON.stringify(policy).replace(/'/g, "&#39;")}, "${hubName}")'>
                        YAML
                    </button>
                    ${policy.complianceState?.toLowerCase() !== 'compliant' ? `
                    <button class="btn btn--warn btn--xs" onclick='enforcePolicyWithCGU(${JSON.stringify(policy).replace(/'/g, "&#39;")}, "${hubName}")'>
                        Enforce
                    </button>
                    ` : ''}
                </td>
            </tr>
            <tr id="${spokePolicyDetailId}" style="display: none;" class="data-table__detail-row">
                <td colspan="5" class="data-table__detail-cell">
                    ${renderPolicyDetails(policy)}
                </td>
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>
    `;
    return html;
}

// Render spoke hardware details (original for cards)
function renderSpokeHardware(nodes) {
    if (nodes.length === 0) return '';

    let html = '<div><h4>Hardware Inventory</h4>';
    nodes.forEach(node => {
        html += `
            <div class="hardware-grid">
                <div class="hardware-grid__item">
                    <span class="hardware-grid__label">CPU:</span>
                    ${node.capacity?.cpu || 'N/A'}
                </div>
                <div class="hardware-grid__item">
                    <span class="hardware-grid__label">RAM:</span>
                    ${node.capacity?.memory || 'N/A'}
                </div>
                <div class="hardware-grid__item">
                    <span class="hardware-grid__label">Storage:</span>
                    ${node.capacity?.storage || 'N/A'}
                </div>
                <div class="hardware-grid__item">
                    <span class="hardware-grid__label">IP:</span>
                    ${node.internalIP || 'N/A'}
                </div>
                ${node.annotations?.['bmc-address'] ? `
                <div class="hardware-grid__item hardware-grid__item--wide">
                    <span class="hardware-grid__label">BMC:</span>
                    <small class="mono mono--sm">${node.annotations['bmc-address']}</small>
                </div>
                ` : ''}
                ${node.annotations?.manufacturer ? `
                <div class="hardware-grid__item">
                    <span class="hardware-grid__label">Vendor:</span>
                    ${node.annotations.manufacturer}
                </div>
                ` : ''}
                ${node.annotations?.['serial-number'] ? `
                <div class="hardware-grid__item">
                    <span class="hardware-grid__label">S/N:</span>
                    <small class="mono">${node.annotations['serial-number']}</small>
                </div>
                ` : ''}
            </div>
        `;
    });
    html += '</div>';
    return html;
}

// Render compact hardware for detail view
function renderSpokeHardwareCompact(nodes) {
    if (nodes.length === 0) return '';

    let html = '<div class="hardware-grid hardware-grid--compact">';
    nodes.forEach(node => {
        html += `
            <div class="hardware-grid__item">
                <strong>CPU:</strong> ${node.capacity?.cpu || 'N/A'}
            </div>
            <div class="hardware-grid__item">
                <strong>RAM:</strong> ${node.capacity?.memory || 'N/A'}
            </div>
            <div class="hardware-grid__item">
                <strong>Storage:</strong> ${node.capacity?.storage || 'N/A'}
            </div>
            <div class="hardware-grid__item">
                <strong>IP:</strong> ${node.internalIP || 'N/A'}
            </div>
            ${node.annotations?.['bmc-address'] ? `
            <div class="hardware-grid__item hardware-grid__item--wide">
                <strong>BMC:</strong> <code class="mono mono--sm">${node.annotations['bmc-address']}</code>
            </div>
            ` : ''}
            ${node.annotations?.manufacturer ? `
            <div class="hardware-grid__item">
                <strong>Vendor:</strong> ${node.annotations.manufacturer}
            </div>
            ` : ''}
            ${node.annotations?.['serial-number'] ? `
            <div class="hardware-grid__item">
                <strong>S/N:</strong> <code class="mono">${node.annotations['serial-number']}</code>
            </div>
            ` : ''}
        `;
    });
    html += '</div>';
    return html;
}

// Render nodes - merge K8s and BMH data for same physical nodes
function renderNodes(nodes) {
    if (nodes.length === 0) {
        return '<div class="empty-state"><div class="empty-state__icon">🖥️</div><p>No node information available</p></div>';
    }

    const nodeMap = new Map();
    nodes.forEach(node => {
        const hostname = node.name.split('.')[0];
        if (!nodeMap.has(hostname)) {
            nodeMap.set(hostname, { hostname, fullName: node.name, k8sNode: null, bmhNode: null });
        }
        const nodeData = nodeMap.get(hostname);
        if (node.annotations?.['data-source'] === 'Node') {
            nodeData.k8sNode = node;
        } else {
            nodeData.bmhNode = node;
        }
    });

    let html = '<div class="grid">';
    nodeMap.forEach((nodeData) => { html += renderMergedNodeCard(nodeData); });
    html += '</div>';
    return html;
}

// Render a merged node card with both K8s and BMH info
function renderMergedNodeCard(nodeData) {
    const node = nodeData.k8sNode || nodeData.bmhNode;
    const statusClass = node.status.toLowerCase().includes('ready') ? 'ready' : 'notready';

    return `
        <div class="card">
            <div class="card__title">
                <span>${nodeData.hostname}</span>
                <span class="status status--${statusClass}">${node.status}</span>
            </div>

            ${nodeData.k8sNode ? `
            <div class="k8s-section">
                <h4>Kubernetes Node Info</h4>
                <div class="info-row">
                    <span class="info-row__label">Role:</span>
                    <span class="info-row__value">${nodeData.k8sNode.role || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="info-row__label">Status:</span>
                    <span class="info-row__value"><span class="status status--${statusClass}">${nodeData.k8sNode.status}</span></span>
                </div>
                <div class="info-row">
                    <span class="info-row__label">Kubelet:</span>
                    <span class="info-row__value">${nodeData.k8sNode.kubeletVersion || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="info-row__label">OS:</span>
                    <span class="info-row__value">${nodeData.k8sNode.osImage || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="info-row__label">Kernel:</span>
                    <span class="info-row__value">${nodeData.k8sNode.kernelVersion || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="info-row__label">Container Runtime:</span>
                    <span class="info-row__value">${nodeData.k8sNode.containerRuntime || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="info-row__label">IP Address:</span>
                    <span class="info-row__value"><code class="mono">${nodeData.k8sNode.internalIP || 'N/A'}</code></span>
                </div>
            </div>
            ` : ''}

            ${nodeData.bmhNode ? `
            <div class="hardware-section">
                <h4>Hardware Info (BareMetalHost)</h4>
                <div class="info-row">
                    <span class="info-row__label">CPU:</span>
                    <span class="info-row__value"><strong>${nodeData.bmhNode.capacity?.cpu || 'N/A'}</strong></span>
                </div>
                ${nodeData.bmhNode.annotations?.['cpu-model'] ? `
                <div class="info-row">
                    <span class="info-row__label">CPU Model:</span>
                    <span class="info-row__value"><small>${nodeData.bmhNode.annotations['cpu-model']}</small></span>
                </div>
                ` : ''}
                <div class="info-row">
                    <span class="info-row__label">RAM:</span>
                    <span class="info-row__value"><strong>${nodeData.bmhNode.capacity?.memory || 'N/A'}</strong></span>
                </div>
                <div class="info-row">
                    <span class="info-row__label">Storage:</span>
                    <span class="info-row__value"><strong>${nodeData.bmhNode.capacity?.storage || 'N/A'}</strong></span>
                </div>
                ${nodeData.bmhNode.annotations?.['bmc-address'] ? `
                <div class="info-row">
                    <span class="info-row__label">BMC:</span>
                    <span class="info-row__value"><small class="mono mono--break">${nodeData.bmhNode.annotations['bmc-address']}</small></span>
                </div>
                ` : ''}
                ${nodeData.bmhNode.annotations?.manufacturer ? `
                <div class="info-row">
                    <span class="info-row__label">Manufacturer:</span>
                    <span class="info-row__value">${nodeData.bmhNode.annotations.manufacturer}</span>
                </div>
                ` : ''}
                ${nodeData.bmhNode.annotations?.['product-name'] ? `
                <div class="info-row">
                    <span class="info-row__label">Product:</span>
                    <span class="info-row__value"><small>${nodeData.bmhNode.annotations['product-name']}</small></span>
                </div>
                ` : ''}
                ${nodeData.bmhNode.annotations?.['serial-number'] ? `
                <div class="info-row">
                    <span class="info-row__label">Serial Number:</span>
                    <span class="info-row__value"><code class="mono">${nodeData.bmhNode.annotations['serial-number']}</code></span>
                </div>
                ` : ''}
                ${nodeData.bmhNode.annotations?.['nic-count'] ? `
                <div class="info-row">
                    <span class="info-row__label">Network:</span>
                    <span class="info-row__value">${nodeData.bmhNode.annotations['nic-count']} NICs, IP: ${nodeData.bmhNode.internalIP || 'N/A'}</span>
                </div>
                ` : ''}
            </div>
            ` : ''}
        </div>
    `;
}

// Render individual node card
function renderNodeCard(node, type) {
    const statusClass = node.status.toLowerCase().includes('ready') ? 'ready' : 'notready';
    const sourceLabel = type === 'kubernetes' ? 'K8s Node' : 'BMH';
    return `
        <div class="card">
            <div class="card__title">
                <span>${node.name.split('.')[0]}</span>
                <span class="status status--${statusClass}">${node.status}</span>
            </div>
            <div class="k8s-section k8s-section__label">
                ${sourceLabel}
            </div>
                <div class="info-row">
                    <span class="info-row__label">Role:</span>
                    <span class="info-row__value">${node.role || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="info-row__label">CPU:</span>
                    <span class="info-row__value"><strong>${node.capacity?.cpu || 'N/A'}</strong></span>
                </div>
                ${node.annotations?.['cpu-model'] ? `
                <div class="info-row">
                    <span class="info-row__label">CPU Model:</span>
                    <span class="info-row__value"><small>${node.annotations['cpu-model']}</small></span>
                </div>
                ` : ''}
                <div class="info-row">
                    <span class="info-row__label">RAM:</span>
                    <span class="info-row__value"><strong>${node.capacity?.memory || 'N/A'}</strong></span>
                </div>
                <div class="info-row">
                    <span class="info-row__label">Storage:</span>
                    <span class="info-row__value"><strong>${node.capacity?.storage || 'N/A'}</strong></span>
                </div>
                ${renderDiskDetails(node)}
                <div class="info-row">
                    <span class="info-row__label">IP Address:</span>
                    <span class="info-row__value"><code class="mono">${node.internalIP || 'N/A'}</code></span>
                </div>
                ${node.annotations?.['bmc-address'] ? `
                <div class="info-row">
                    <span class="info-row__label">BMC Address:</span>
                    <span class="info-row__value"><small class="mono mono--break">${node.annotations['bmc-address']}</small></span>
                </div>
                ` : ''}
                ${node.annotations?.manufacturer ? `
                <div class="info-row">
                    <span class="info-row__label">Manufacturer:</span>
                    <span class="info-row__value">${node.annotations.manufacturer}</span>
                </div>
                ` : ''}
                ${node.annotations?.['product-name'] ? `
                <div class="info-row">
                    <span class="info-row__label">Product:</span>
                    <span class="info-row__value"><small>${node.annotations['product-name']}</small></span>
                </div>
                ` : ''}
                ${node.annotations?.['serial-number'] ? `
                <div class="info-row">
                    <span class="info-row__label">Serial Number:</span>
                    <span class="info-row__value"><code class="mono">${node.annotations['serial-number']}</code></span>
                </div>
                ` : ''}
                ${node.annotations?.['nic-count'] ? `
                <div class="info-row">
                    <span class="info-row__label">Network Interfaces:</span>
                    <span class="info-row__value">${node.annotations['nic-count']} NICs</span>
                </div>
                ` : ''}
            </div>
        `;
}

// Render disk details
function renderDiskDetails(node) {
    let html = '';
    for (let i = 1; i <= 10; i++) {
        const diskKey = `disk-${i}`;
        if (node.annotations?.[diskKey]) {
            html += `
                <div class="info-row">
                    <span class="info-row__label">Disk ${i}:</span>
                    <span class="info-row__value"><small class="mono">${node.annotations[diskKey]}</small></span>
                </div>
            `;
        }
    }
    return html;
}

// Render policies table
function renderPolicies(policies) {
    if (policies.length === 0) {
        return '<div class="empty-state"><div class="empty-state__icon">📋</div><p>No policies found</p></div>';
    }

    const sortedPolicies = [...policies].sort((a, b) => {
        const waveA = parseInt(a.annotations?.['ran.openshift.io/ztp-deploy-wave'] || '999');
        const waveB = parseInt(b.annotations?.['ran.openshift.io/ztp-deploy-wave'] || '999');
        return waveA - waveB;
    });

    const compliantCount = sortedPolicies.filter(p => p.complianceState === 'Compliant').length;

    let html = `
        <div class="spoke-policy-filter">
            <div class="spoke-policy-filter__row">
                <div class="spoke-policy-filter__input">
                    <input type="text" id="search-policy-name" placeholder="Search policy name..."
                           class="filter-bar__input filter-bar__input--compact"
                           onkeyup="filterPolicies()">
                </div>
                <div class="spoke-policy-filter__radios">
                    <label class="filter-bar__radio-label filter-bar__radio-label--sm">
                        <input type="radio" name="compliance-filter" value="" checked onchange="filterPolicies()">All
                    </label>
                    <label class="filter-bar__radio-label filter-bar__radio-label--sm">
                        <input type="radio" name="compliance-filter" value="compliant" onchange="filterPolicies()">
                        <span>Compliant</span>
                    </label>
                    <label class="filter-bar__radio-label filter-bar__radio-label--sm">
                        <input type="radio" name="compliance-filter" value="noncompliant" onchange="filterPolicies()">
                        <span>NonCompliant</span>
                    </label>
                </div>
                <button class="btn btn--secondary btn--xs" onclick="clearPolicySearch()">Clear</button>
            </div>
            <div id="policy-count" class="filter-bar__count--sm">
                ${compliantCount}/${sortedPolicies.length} compliant
            </div>
        </div>

        <table class="data-table" id="policies-table">
            <thead>
                <tr>
                    <th>Policy</th>
                    <th>Compliance</th>
                    <th>Remediation</th>
                    <th>Wave</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
    `;

    sortedPolicies.forEach((policy, index) => {
        const complianceClass = policy.complianceState?.toLowerCase() === 'compliant' ? 'policy-badge--compliant' : 'policy-badge--noncompliant';
        const remediationClass = policy.remediationAction === 'enforce' ? 'policy-badge--enforce' : 'policy-badge--inform';
        const policyId = `policy-${index}`;
        const ztpWave = policy.annotations?.['ran.openshift.io/ztp-deploy-wave'] || 'N/A';

        html += `
            <tr class="policy-row" data-policy-name="${policy.name.toLowerCase()}" data-compliance="${(policy.complianceState || '').toLowerCase()}">
                <td><strong>${policy.name}</strong></td>
                <td><span class="policy-badge ${complianceClass}">${policy.complianceState || 'Unknown'}</span></td>
                <td><span class="policy-badge ${remediationClass}">${policy.remediationAction || 'N/A'}</span></td>
                <td><span class="badge badge--wave">${ztpWave}</span></td>
                <td>
                    <button class="btn btn--secondary btn--xs" onclick="showPolicyDetails(${index}, '${policy.name.replace(/'/g, "\\'")}')">
                        Details
                    </button>
                    <button class="btn btn--primary btn--xs" onclick='downloadPolicyYAML(${JSON.stringify(policy).replace(/'/g, "&#39;")})'>
                        YAML
                    </button>
                    ${policy.complianceState?.toLowerCase() !== 'compliant' ? `
                    <button class="btn btn--warn btn--xs" onclick='enforcePolicyWithCGU(${JSON.stringify(policy).replace(/'/g, "&#39;")}, null)'>
                        Enforce
                    </button>
                    ` : ''}
                </td>
            </tr>
            <tr id="${policyId}" class="data-table__detail-row" style="display: none;">
                <td colspan="5" class="data-table__detail-cell">
                    ${renderPolicyDetails(policy)}
                </td>
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>
    `;
    return html;
}

// Show/hide policy details
function showPolicyDetails(index, policyName) {
    const detailsRow = document.getElementById(`policy-${index}`);
    if (detailsRow) {
        detailsRow.style.display = detailsRow.style.display === 'none' ? 'table-row' : 'none';
    }
}

// Render policy details
function renderPolicyDetails(policy) {
    const isCompliant = policy.complianceState?.toLowerCase() === 'compliant';
    const violationColor = (policy.violations > 0) ? 'spoke-stat-card__value--warn' : 'spoke-stat-card__value--ok';

    return `
        <div>
            <div class="policy-detail__grid">
                <div class="policy-detail__summary">
                    <div class="policy-detail__summary-label">Namespace</div>
                    <div class="policy-detail__summary-value">${policy.namespace}</div>
                </div>
                <div class="policy-detail__summary">
                    <div class="policy-detail__summary-label">Compliance</div>
                    <div><span class="policy-badge policy-badge--sm ${isCompliant ? 'policy-badge--compliant' : 'policy-badge--noncompliant'}">${policy.complianceState || 'Unknown'}</span></div>
                </div>
                <div class="policy-detail__summary">
                    <div class="policy-detail__summary-label">Remediation</div>
                    <div><span class="policy-badge policy-badge--sm ${policy.remediationAction === 'enforce' ? 'policy-badge--enforce' : 'policy-badge--inform'}">${policy.remediationAction || 'N/A'}</span></div>
                </div>
                <div class="policy-detail__summary">
                    <div class="policy-detail__summary-label">Violations</div>
                    <div class="policy-detail__summary-value--lg ${violationColor}">${policy.violations || 0}</div>
                </div>
            </div>

            ${policy.annotations?.['latest-status-message'] ? `
            <div class="policy-detail__message ${isCompliant ? 'policy-detail__message--compliant' : 'policy-detail__message--noncompliant'}">
                <div class="policy-detail__message-header">
                    <strong class="policy-detail__message-title ${isCompliant ? 'policy-detail__message-title--ok' : 'policy-detail__message-title--warn'}">Status Message</strong>
                    <small class="policy-detail__message-time">${policy.annotations['latest-status-timestamp'] ? new Date(policy.annotations['latest-status-timestamp']).toLocaleString() : 'Recent'}</small>
                </div>
                <div class="code-block code-block--sm">
${policy.annotations['latest-status-message']}
                </div>
            </div>
            ` : ''}

            <div class="policy-detail__columns">
                <div>
                    <strong class="policy-detail__section-title">Additional Info</strong>
                    <div class="policy-detail__info-list">
                        <div class="policy-detail__info-item">
                            <span class="policy-detail__info-key">Full Name:</span>
                            <code class="mono mono--xs">${policy.name}</code>
                        </div>
                        <div class="policy-detail__info-item">
                            <span class="policy-detail__info-key">Severity:</span>
                            <span>${policy.severity || 'N/A'}</span>
                        </div>
                        <div class="policy-detail__info-item">
                            <span class="policy-detail__info-key">Disabled:</span>
                            <span>${policy.disabled ? 'Yes' : 'No'}</span>
                        </div>
                        <div class="policy-detail__info-item">
                            <span class="policy-detail__info-key">Created:</span>
                            <span class="data-table__cell--date">${new Date(policy.createdAt).toLocaleDateString()}</span>
                        </div>
                    </div>
                </div>
                <div>
                ${Object.keys(policy.labels || {}).length > 0 ? `
                <div>
                    <strong class="policy-detail__section-title">Labels (${Object.keys(policy.labels).length})</strong>
                    <div class="code-block code-block--labels">${Object.entries(policy.labels).map(([key, value]) => `${key}: ${value}`).join('<br>')}</div>
                </div>
                ` : ''}

                ${Object.keys(policy.annotations || {}).length > 0 ? `
                <div>
                    <strong class="policy-detail__section-title">Annotations (${Object.keys(policy.annotations).length})</strong>
                    <div class="code-block code-block--xs">${Object.entries(policy.annotations).slice(0, 3).map(([key, value]) => `${key}: ${value.substring(0, 35)}${value.length > 35 ? '...' : ''}`).join('<br>')}${Object.keys(policy.annotations).length > 3 ? '<br>... +' + (Object.keys(policy.annotations).length - 3) + ' more' : ''}</div>
                </div>
                ` : ''}
            </div>
        </div>
    `;
}

// Switch tabs
function switchTab(index, hubName) {
    document.querySelectorAll('.tabs__item').forEach(tab => tab.classList.remove('tabs__item--active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('tab-content--active'));

    const selectedTab = document.querySelectorAll('.tabs__item')[index];
    const selectedContent = document.getElementById(`tab-${index}`);

    if (selectedTab) selectedTab.classList.add('tabs__item--active');
    if (selectedContent) selectedContent.classList.add('tab-content--active');
}

// Show error
function showError(message) {
    document.getElementById('app').innerHTML = `
        <div class="error-panel">
            <h3 class="error-panel__title">Error</h3>
            <p>${message}</p>
            <div class="error-panel__help">
                <h4 class="error-panel__help-title">Backend API is Running!</h4>
                <p>The frontend is deployed but needs API proxy configuration. You can access the API directly:</p>
                <div class="error-panel__code">
                    <div>Backend is accessible at: <strong>http://192.168.58.16:8080/api</strong></div>
                    <div>Service endpoint: <strong>acm-fleet-backend.acm-fleet.svc:8080</strong></div>
                </div>
                <h5>Test the API:</h5>
                <pre class="error-panel__pre">curl http://192.168.58.16:8080/api/hubs | jq .</pre>
                <h5>Data Available:</h5>
                <ul class="error-panel__list">
                    <li>2 Managed Hubs (acm1, acm2)</li>
                    <li>1 Spoke Cluster (sno146 SNO)</li>
                    <li>46 Policies (100% compliant)</li>
                    <li>4 BareMetalHost Nodes</li>
                    <li>Complete Hardware: CPU, RAM, Storage, BMC, Network</li>
                </ul>
            </div>
            <button class="btn btn--secondary" onclick="testDirectAPI()">
                Show Sample Data
            </button>
        </div>
    `;
}

// Show sample data from API
async function testDirectAPI() {
    const app = document.getElementById('app');
    app.innerHTML = '<div class="loading"><div class="loading__spinner"></div><p>Fetching sample data...</p></div>';

    try {
        const response = await fetch('http://192.168.58.16:8080/api/hubs');
        const data = await response.json();
        if (data.success) {
            renderHubsList(data.data);
        } else {
            showError('Backend returned error: ' + (data.error || 'Unknown'));
        }
    } catch (error) {
        showError('Cannot reach backend from browser due to CORS. Backend is working - see instructions above.');
    }
}

// Show add hub form
function showAddHubForm() {
    const app = document.getElementById('app');
    app.innerHTML = `
        <button class="back-button" onclick="returnToHomepage()">← Back to Hubs</button>

        <h2 class="section-heading">Add New Hub</h2>

        <div class="card hub-form">
            <div class="hub-form__tabs">
                <button type="button" class="hub-form__tab hub-form__tab--active" id="tab-kubeconfig" onclick="switchAddHubMethod('kubeconfig')">
                    Kubeconfig File
                </button>
                <button type="button" class="hub-form__tab" id="tab-credentials" onclick="switchAddHubMethod('credentials')">
                    API Credentials
                </button>
            </div>

            <form onsubmit="submitAddHub(event)" class="hub-form__body">
                <div class="hub-form__field">
                    <label class="hub-form__label">Hub Name</label>
                    <input type="text" id="hub-name" placeholder="e.g., acm3, regional-hub-1"
                           required class="hub-form__input">
                    <small class="hub-form__hint">Lowercase alphanumeric with hyphens, will be used as namespace</small>
                </div>

                <!-- Kubeconfig Method -->
                <div id="method-kubeconfig">
                    <div class="hub-form__field">
                        <label class="hub-form__label">
                            Kubeconfig
                            <span class="hub-form__label-hint">(YAML or JSON format)</span>
                        </label>
                        <textarea id="hub-kubeconfig" placeholder="Paste kubeconfig content here (YAML or JSON)..."
                                  rows="12" class="hub-form__textarea"></textarea>
                        <small class="hub-form__hint">Supports both YAML and JSON formats</small>
                    </div>
                </div>

                <!-- API Credentials Method -->
                <div id="method-credentials" style="display: none;">
                    <div class="hub-form__field">
                        <label class="hub-form__label">API Server Endpoint</label>
                        <input type="text" id="hub-api-endpoint" placeholder="https://api.cluster.example.com:6443"
                               class="hub-form__input">
                        <small class="hub-form__hint">Full API server URL including port</small>
                    </div>

                    <div class="info-box">
                        <strong>Choose authentication method:</strong>
                    </div>

                    <div class="hub-form__cred-grid">
                        <div>
                            <label class="hub-form__label">Username</label>
                            <input type="text" id="hub-username" placeholder="admin" class="hub-form__input">
                        </div>
                        <div>
                            <label class="hub-form__label">Password</label>
                            <input type="password" id="hub-password" placeholder="••••••••" class="hub-form__input">
                        </div>
                    </div>

                    <div class="hub-form__separator">- OR -</div>

                    <div class="hub-form__field">
                        <label class="hub-form__label">Bearer Token</label>
                        <textarea id="hub-token" placeholder="Paste service account token here..."
                                  rows="4" class="hub-form__textarea hub-form__textarea--token"></textarea>
                        <small class="hub-form__hint">Use either username/password OR token (not both)</small>
                    </div>
                </div>

                <div class="hub-form__actions">
                    <button type="button" class="btn btn--secondary" onclick="fetchHubs()">
                        Cancel
                    </button>
                    <button type="submit" class="btn btn--primary">
                        Add Hub
                    </button>
                </div>
            </form>
        </div>
    `;
}

// Switch add hub method
function switchAddHubMethod(method) {
    document.getElementById('tab-kubeconfig').classList.toggle('hub-form__tab--active', method === 'kubeconfig');
    document.getElementById('tab-credentials').classList.toggle('hub-form__tab--active', method === 'credentials');

    document.getElementById('method-kubeconfig').style.display = method === 'kubeconfig' ? 'block' : 'none';
    document.getElementById('method-credentials').style.display = method === 'credentials' ? 'block' : 'none';
}

// Submit add hub form
async function submitAddHub(event) {
    event.preventDefault();

    const hubName = document.getElementById('hub-name').value.trim();

    if (!/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(hubName)) {
        alert('Invalid hub name. Must be lowercase alphanumeric with hyphens.');
        return;
    }

    const kubeconfigMethod = document.getElementById('method-kubeconfig').style.display !== 'none';

    let requestBody = { hubName: hubName };

    if (kubeconfigMethod) {
        const kubeconfigRaw = document.getElementById('hub-kubeconfig').value.trim();
        if (!kubeconfigRaw) {
            alert('Please provide kubeconfig content');
            return;
        }
        requestBody.kubeconfig = btoa(kubeconfigRaw);
    } else {
        const apiEndpoint = document.getElementById('hub-api-endpoint').value.trim();
        const username = document.getElementById('hub-username').value.trim();
        const password = document.getElementById('hub-password').value.trim();
        const token = document.getElementById('hub-token').value.trim();

        if (!apiEndpoint) {
            alert('Please provide API server endpoint');
            return;
        }

        if (!token && (!username || !password)) {
            alert('Please provide either username/password OR token');
            return;
        }

        requestBody.apiEndpoint = apiEndpoint;
        if (token) {
            requestBody.token = token;
        } else {
            requestBody.username = username;
            requestBody.password = password;
        }
    }

    try {
        const response = await fetch(`${API_BASE}/hubs/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (data.success) {
            alert(
                `Hub added successfully!\n\n` +
                `Hub Name: ${data.data.hubName}\n` +
                `Namespace: ${data.data.namespace}\n` +
                `Secret: ${data.data.secretName}\n\n` +
                `The hub will appear in the list after refresh.`
            );
            delete window.cachedHubsData;
            fetchHubs();
        } else {
            alert('Failed to add hub: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        alert('Error adding hub: ' + error.message);
    }
}

// Quick return to homepage using cached data
function returnToHomepage() {
    if (window.cachedHubsData) {
        currentView = 'hubs';
        renderHubsList(window.cachedHubsData);
    } else {
        fetchHubs();
    }
}

// Refresh single hub (clears cache for that hub and reloads its card)
async function refreshHub(hubName) {
    const hubCard = document.querySelector(`[data-hub="${CSS.escape(hubName)}"]`);
    if (!hubCard) return;

    const originalContent = hubCard.innerHTML;
    hubCard.innerHTML = '<div class="loading__text">Refreshing...</div>';

    try {
        await fetch(`${API_BASE}/hubs/${hubName}/refresh`, { method: 'POST' });
        const response = await fetch(`${API_BASE}/hubs/${hubName}`);
        const data = await response.json();

        if (data.success && data.data) {
            renderHubCard(data.data, hubCard);
        } else {
            throw new Error(data.error || 'Failed to fetch hub');
        }
    } catch (error) {
        console.error('Error refreshing hub:', error);
        hubCard.innerHTML = originalContent;
        alert('Failed to refresh hub: ' + error.message);
    }
}

// Render a single hub card (update in-place during refresh)
function renderHubCard(hub, cardElement) {
    const isUnmanaged = hub.annotations?.source === 'manual' || hub.labels?.type === 'unmanaged';
    const temp = document.createElement('div');
    temp.innerHTML = renderHubCardHTML(hub, { showDelete: isUnmanaged });
    const newCard = temp.firstElementChild;
    cardElement.innerHTML = newCard.innerHTML;
    for (const attr of newCard.attributes) {
        if (attr.name.startsWith('data-')) {
            cardElement.setAttribute(attr.name, attr.value);
        }
    }
}

// Render just the hub sections (for refresh)
function renderHubSections(hubs) {
    const managedHubs = hubs.filter(h => h.annotations?.source !== 'manual');
    const unmanagedHubs = hubs.filter(h => h.annotations?.source === 'manual');

    const managedSection = document.querySelector('.managed-hubs-section');
    if (managedSection && managedHubs.length > 0) {
        let html = '<div class="grid">';
        managedHubs.forEach(hub => { html += renderHubCardHTML(hub); });
        html += '</div>';
        managedSection.innerHTML = html;
    }

    const unmanagedSection = document.querySelector('.unmanaged-hubs-section');
    if (unmanagedSection) {
        if (unmanagedHubs.length > 0) {
            let html = '<div class="grid">';
            unmanagedHubs.forEach(hub => { html += renderHubCardHTML(hub, { showDelete: true }); });
            html += '</div>';
            unmanagedSection.innerHTML = html;
        } else {
            unmanagedSection.innerHTML = `
                <div class="card card--muted card--centered">
                    <div class="empty-state__icon--md">📦</div>
                    <h3 class="empty-state__title">No Unmanaged Hubs</h3>
                    <p class="empty-state__text">
                        ${managedHubs.length === 0 ? 'No hubs discovered automatically.' : 'Add external hub clusters by providing their kubeconfig.'}<br>
                        ${managedHubs.length === 0 ? 'Add your first hub to start monitoring.' : 'These hubs will be monitored without being managed by this Global Hub.'}
                    </p>
                    <button class="btn btn--primary" onclick="showAddHubForm()">
                        Add Your First Hub
                    </button>
                </div>
            `;
        }
    }
}

// Initialize app
fetchHubs();

// Render operators list
function renderOperators(operators) {
    if (operators.length === 0) {
        return '<div class="empty-state"><div class="empty-state__icon">🔧</div><p>No operators found</p></div>';
    }

    const operatorMap = new Map();
    operators.forEach(op => {
        const key = op.displayName || op.name;
        if (!operatorMap.has(key)) {
            operatorMap.set(key, {
                displayName: op.displayName || op.name,
                name: op.name,
                version: op.version,
                namespaces: [],
                phase: op.phase,
                provider: op.provider,
                createdAt: op.createdAt
            });
        }
        operatorMap.get(key).namespaces.push(op.namespace);
    });

    const uniqueOperators = Array.from(operatorMap.values());

    let html = `
        <div class="card filter-bar">
            <div class="filter-bar__row filter-bar__row--between">
                <div class="filter-bar__summary">
                    ${uniqueOperators.length} unique operator${uniqueOperators.length !== 1 ? 's' : ''} (${operators.length} total installations)
                </div>
                <div class="filter-bar__row">
                    <div>
                        <input type="text" id="search-operator-name" placeholder="Search operator..."
                               class="filter-bar__input filter-bar__input--compact"
                               onkeyup="filterOperators()">
                    </div>
                    <button class="btn btn--secondary btn--sm" onclick="clearOperatorSearch()">
                        Clear
                    </button>
                </div>
            </div>
            <div id="operator-count" class="filter-bar__count">
                Showing ${uniqueOperators.length} operator${uniqueOperators.length !== 1 ? 's' : ''}
            </div>
        </div>

        <div class="card">
            <table id="operators-table">
                <thead>
                    <tr>
                        <th>Operator Name</th>
                        <th>Version</th>
                        <th>Namespaces</th>
                        <th>Status</th>
                        <th>Provider</th>
                    </tr>
                </thead>
                <tbody>
    `;

    uniqueOperators.forEach((operator) => {
        const phaseClass = operator.phase === 'Succeeded' ? 'ready' : 'notready';
        const namespaceCount = operator.namespaces.length;
        const namespaceDisplay = namespaceCount === 1 ? operator.namespaces[0] : `${namespaceCount} namespaces`;

        html += `
            <tr class="operator-row" data-operator-name="${operator.displayName.toLowerCase()}">
                <td>
                    <strong>${operator.displayName}</strong>
                    ${operator.displayName !== operator.name ? `<br><small class="data-table__cell--muted">${operator.name}</small>` : ''}
                </td>
                <td><code class="config-badge">${operator.version || 'N/A'}</code></td>
                <td>
                    ${namespaceCount === 1 ? operator.namespaces[0] : `<span class="badge">${namespaceCount} ns</span>`}
                    ${namespaceCount > 1 ? `<br><small class="data-table__cell--muted">${operator.namespaces.slice(0, 3).join(', ')}${namespaceCount > 3 ? `, +${namespaceCount - 3} more` : ''}</small>` : ''}
                </td>
                <td><span class="status status--${phaseClass}">${operator.phase || 'Unknown'}</span></td>
                <td>${operator.provider || 'N/A'}</td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
    `;
    return html;
}

// Filter operators
function filterOperators() {
    const searchTerm = document.getElementById('search-operator-name')?.value.toLowerCase() || '';
    const rows = document.querySelectorAll('.operator-row');
    let visibleCount = 0;

    rows.forEach(row => {
        const operatorName = row.getAttribute('data-operator-name') || '';
        if (operatorName.includes(searchTerm)) {
            row.style.display = '';
            visibleCount++;
        } else {
            row.style.display = 'none';
        }
    });

    const countDiv = document.getElementById('operator-count');
    if (countDiv) {
        countDiv.textContent = `Showing ${visibleCount} operator${visibleCount !== 1 ? 's' : ''}`;
    }
}

// Debounced versions of filter functions for use with onkeyup
const debouncedFilterOperators = debounce(filterOperators, 200);
const debouncedFilterSpokes = debounce(filterSpokes, 200);
const debouncedFilterPolicies = debounce(filterPolicies, 200);

// Clear operator search
function clearOperatorSearch() {
    const searchInput = document.getElementById('search-operator-name');
    if (searchInput) {
        searchInput.value = '';
        filterOperators();
    }
}

// v4: Render Local Cluster section
function renderLocalClusterSection(globalHub) {
    const managedHubs = globalHub.topology?.hubs?.filter(h => h.isManaged) || [];
    const managedSpokes = globalHub.topology?.hubs?.reduce((total, hub) => {
        if (hub.isManaged) return total + (hub.spokeCount || 0);
        return total;
    }, 0) || 0;

    let html = `
        <div class="local-cluster">
            <h2 class="local-cluster__heading">
                <span class="local-cluster__icon">🌐</span>
                <span>Local Cluster</span>
            </h2>
            <div class="card card--accent">
                <div class="info-row">
                    <span class="info-row__label">Cluster Name:</span>
                    <span class="info-row__value">${globalHub.name || 'Unknown'}</span>
                </div>
                <div class="info-row">
                    <span class="info-row__label">OpenShift Version:</span>
                    <span class="info-row__value">${globalHub.openshiftVersion || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="info-row__label">Platform:</span>
                    <span class="info-row__value">${globalHub.platform}</span>
                </div>
                <div class="info-row">
                    <span class="info-row__label">Nodes:</span>
                    <span class="info-row__value"><span class="badge">${globalHub.nodeCount}</span></span>
                </div>
                ${managedHubs.length > 0 ? `
                <div class="info-row">
                    <span class="info-row__label">Managed Hubs (MCL - ACM type):</span>
                    <span class="info-row__value"><span class="badge">${managedHubs.length}</span></span>
                </div>
                ` : ''}
                ${managedSpokes > 0 ? `
                <div class="info-row">
                    <span class="info-row__label">Managed Spokes (MCL - non-ACM):</span>
                    <span class="info-row__value"><span class="badge">${managedSpokes}</span></span>
                </div>
                ` : ''}
            </div>
        </div>
    `;
    return html;
}

// Render hub topology tree
function renderTopology(topology) {
    let html = '<div class="topology-tree">';

    topology.hubs.forEach((hub, hubIndex) => {
        const isLast = hubIndex === topology.hubs.length - 1;
        const hubPrefix = isLast ? '└──' : '├──';
        const hubStatus = hub.status.toLowerCase().includes('connected') || hub.status.toLowerCase().includes('ready') ? '✅' : '❌';

        html += '<div class="topology-tree__hub">';
        html += `<div class="topology-tree__hub-line">${hubPrefix} ${hubStatus} ${hub.name} <span class="topology-tree__hub-meta">(${hub.spokeCount} spokes)</span></div>`;

        if (hub.spokes && hub.spokes.length > 0) {
            hub.spokes.forEach((spoke, spokeIndex) => {
                const isSpokeList = spokeIndex === hub.spokes.length - 1;
                const spokePrefix = isLast ? '    ' : '│   ';
                const spokeConnector = isSpokeList ? '└──' : '├──';
                const spokeStatus = spoke.status.toLowerCase().includes('ready') ? '✅' : '❌';

                html += `<div class="topology-tree__spoke-line">${spokePrefix}${spokeConnector} ${spokeStatus} ${spoke.name}</div>`;
            });
        }
        html += '</div>';
    });

    html += '</div>';
    return html;
}

// v4: Render "no hubs" state with add hub prompt
function renderNoHubsState() {
    const app = document.getElementById('app');

    let html = `
        <div class="card card--muted card--centered empty-state">
            <div class="empty-state__icon">🏢</div>
            <h2 class="empty-state__title">No Hubs Configured</h2>
            <p class="empty-state__text--lg">
                ${rhacmInstalled ? 'No managed hubs detected in this environment.' : 'ACM is not installed on this cluster.'}
            </p>
            <p class="empty-state__text--sm">
                Get started by adding your first hub cluster to monitor.
            </p>
            <button class="btn btn--primary btn--lg" onclick="showAddHubForm()">
                Add Your First Hub
            </button>
        </div>

        <div class="card card--accent getting-started">
            <h3 class="getting-started__title">Getting Started</h3>
            <p class="empty-state__text">
                To monitor ACM hub clusters:
            </p>
            <ol class="getting-started__list">
                <li>Click "Add Your First Hub" above</li>
                <li>Provide the hub cluster's kubeconfig</li>
                <li>The hub will appear in your dashboard</li>
                <li>Monitor spoke clusters, policies, and operators</li>
            </ol>
        </div>
    `;

    app.innerHTML = html;
}

// v4: Remove unmanaged hub
async function removeHub(hubName) {
    if (!confirm(`Are you sure you want to remove hub '${hubName}'?\n\nThis will delete the kubeconfig secret and the hub will no longer be monitored.`)) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/hubs/${hubName}/remove`, { method: 'DELETE' });
        const data = await response.json();

        if (data.success) {
            alert(`Hub '${hubName}' removed successfully!`);
            delete window.cachedHubsData;
            fetchHubs();
        } else {
            alert('Failed to remove hub: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        alert('Error removing hub: ' + error.message);
    }
}
