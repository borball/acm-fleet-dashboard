// Backend API is proxied through nginx on the same hostname
const API_BASE = '/api';

// Main app state
let currentView = 'hubs';
let selectedHub = null;

// Fetch and display all hubs
async function fetchHubs() {
    currentView = 'hubs';
    const app = document.getElementById('app');
    app.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading hubs...</p></div>';
    
    try {
        const response = await fetch(`${API_BASE}/hubs`);
        const data = await response.json();
        if (data.success && data.data) {
            renderHubsList(data.data);
        } else {
            showError(data.error || 'Failed to load hubs');
        }
    } catch (error) {
        showError('Error connecting to API: ' + error.message);
    }
}

// Render hubs list view
function renderHubsList(hubs) {
    const totalSpokes = hubs.reduce((sum, hub) => sum + (hub.managedClusters?.length || 0), 0);
    
    // Collect all policies from hubs and spokes
    const allPolicies = [];
    hubs.forEach(hub => {
        if (hub.policiesInfo) allPolicies.push(...hub.policiesInfo);
        if (hub.managedClusters) {
            hub.managedClusters.forEach(spoke => {
                if (spoke.policiesInfo) allPolicies.push(...spoke.policiesInfo);
            });
        }
    });
    
    const totalPolicies = allPolicies.length;
    const compliantPolicies = allPolicies.filter(p => p.complianceState === 'Compliant').length;
    const compliancePercent = totalPolicies > 0 ? Math.round((compliantPolicies / totalPolicies) * 100) : 0;
    const healthyHubs = hubs.filter(h => h.status.toLowerCase().includes('ready') || h.status.toLowerCase().includes('connected')).length;

    let html = `
        <div class="grid" style="grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); margin-bottom: 30px;">
            <div class="card stat-card">
                <div class="stat-label">Total Hubs</div>
                <div class="stat-number">${hubs.length}</div>
                <small>${healthyHubs} Ready / ${hubs.length - healthyHubs} Not Ready</small>
            </div>
            <div class="card stat-card">
                <div class="stat-label">Total Spokes</div>
                <div class="stat-number">${totalSpokes}</div>
                <small>Across all hubs</small>
            </div>
            <div class="card stat-card">
                <div class="stat-label">Total Policies</div>
                <div class="stat-number">${totalPolicies}</div>
                <small>${compliantPolicies} compliant / ${totalPolicies - compliantPolicies} non-compliant</small>
            </div>
            <div class="card stat-card">
                <div class="stat-label">Compliance</div>
                <div class="stat-number" style="color: ${compliancePercent === 100 ? '#3e8635' : compliancePercent >= 95 ? '#f0ab00' : '#c9190b'};">${compliancePercent}%</div>
                <small>${compliantPolicies}/${totalPolicies} policies</small>
            </div>
        </div>
    `;
    
    // Separate managed and unmanaged hubs
    const managedHubs = hubs.filter(h => h.annotations?.source !== 'manual');
    const unmanagedHubs = hubs.filter(h => h.annotations?.source === 'manual');
    
    // Only show Managed Hubs section if there are managed hubs
    if (managedHubs.length > 0) {
        html += `
            <h2 class="section-title">Managed Hubs</h2>
            <div class="managed-hubs-section">
                <div class="grid">
        `;
        
        managedHubs.forEach(hub => {
        const statusClass = hub.status.toLowerCase().includes('ready') || hub.status.toLowerCase().includes('connected') ? 'ready' : 'notready';
        const spokeCount = hub.managedClusters?.length || 0;
        const policyCount = hub.policiesInfo?.length || 0;
        
        // Calculate merged node count (unique hostnames)
        const uniqueHostnames = new Set();
        (hub.nodesInfo || []).forEach(node => {
            uniqueHostnames.add(node.name.split('.')[0]);
        });
        const nodeCount = uniqueHostnames.size;
        
        html += `
            <div class="card">
                <h3>
                    <span>${hub.name}</span>
                    <span class="status ${statusClass}">${hub.status}</span>
                </h3>
                <div class="info-row">
                    <span class="label">OpenShift Version:</span>
                    <span class="value">${hub.clusterInfo.openshiftVersion || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="label">Kubernetes:</span>
                    <span class="value">${hub.version || 'N/A'}</span>
                </div>
                ${hub.clusterInfo.region ? `
                <div class="info-row">
                    <span class="label">Configuration:</span>
                    <span class="value"><code class="config-badge">${hub.clusterInfo.region}</code></span>
                </div>
                ` : ''}
                <div class="info-row">
                    <span class="label">Nodes:</span>
                    <span class="value"><span class="badge">${nodeCount}</span></span>
                </div>
                ${policyCount > 0 ? `
                <div class="info-row">
                    <span class="label">Policies:</span>
                    <span class="value"><span class="badge success">${policyCount}</span></span>
                </div>
                ` : ''}
                <div class="info-row">
                    <span class="label">Spoke Clusters:</span>
                    <span class="value"><span class="badge">${spokeCount}</span></span>
                </div>
                ${hub.clusterInfo.consoleURL || hub.clusterInfo.gitopsURL ? `
                <div class="info-row" style="display: flex; gap: 10px; justify-content: space-between;">
                    ${hub.clusterInfo.consoleURL ? `<a href="${hub.clusterInfo.consoleURL}" target="_blank" class="console-link">🖥️ Console</a>` : '<span></span>'}
                    ${hub.clusterInfo.gitopsURL ? `<a href="${hub.clusterInfo.gitopsURL}" target="_blank" class="console-link">🔄 GitOps</a>` : '<span></span>'}
                </div>
                        ` : ''}
                        <div style="display: flex; gap: 8px; margin-top: 12px;">
                            <button class="btn btn-secondary" onclick="refreshHub('${hub.name}')" style="flex: 0 0 auto; padding: 10px 16px;" title="Refresh this hub">
                                🔄
                            </button>
                            <button class="btn btn-primary" onclick="showHubDetails('${hub.name}')" style="flex: 1;">
                                View Details
                            </button>
                        </div>
                    </div>
                `;
        });
        
        html += '</div></div>'; // Close grid and managed-hubs-section
    }
    
    // Unmanaged Hubs section
    const topMargin = managedHubs.length > 0 ? 'margin-top: 50px;' : '';
    html += `
        <div style="${topMargin}">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h2 class="section-title" style="margin: 0;">Unmanaged Hubs</h2>
                <button class="btn btn-primary" onclick="showAddHubForm()" style="padding: 10px 20px;">
                    ➕ Add Hub
                </button>
            </div>
            <div class="unmanaged-hubs-section">
    `;
    
    if (unmanagedHubs.length > 0) {
        // Show unmanaged hub cards
        html += '<div class="grid">';
        unmanagedHubs.forEach(hub => {
            const statusClass = hub.status.toLowerCase() === 'ready' || hub.status.toLowerCase() === 'connected' ? 'ready' : 'notready';
            const spokeCount = hub.managedClusters?.length || 0;
            const policyCount = hub.policiesInfo?.length || 0;
            
            // Calculate merged node count
            const uniqueHostnames = new Set();
            (hub.nodesInfo || []).forEach(node => {
                uniqueHostnames.add(node.name.split('.')[0]);
            });
            const nodeCount = uniqueHostnames.size;
            
            html += `
                <div class="card">
                    <h3>
                        <span>${hub.name}</span>
                        <span class="status ${statusClass}">${hub.status}</span>
                    </h3>
                    <div class="info-row">
                        <span class="label">OpenShift Version:</span>
                        <span class="value">${hub.clusterInfo.openshiftVersion || 'N/A'}</span>
                    </div>
                    <div class="info-row">
                        <span class="label">Kubernetes:</span>
                        <span class="value">${hub.version || 'Unknown'}</span>
                    </div>
                    <div class="info-row">
                        <span class="label">Nodes:</span>
                        <span class="value"><span class="badge">${nodeCount}</span></span>
                    </div>
                    <div class="info-row">
                        <span class="label">Spoke Clusters:</span>
                        <span class="value"><span class="badge">${spokeCount}</span></span>
                    </div>
                    ${hub.clusterInfo.consoleURL || hub.clusterInfo.gitopsURL ? `
                    <div class="info-row" style="display: flex; gap: 10px; justify-content: space-between;">
                        ${hub.clusterInfo.consoleURL ? `<a href="${hub.clusterInfo.consoleURL}" target="_blank" class="console-link">🖥️ Console</a>` : '<span></span>'}
                        ${hub.clusterInfo.gitopsURL ? `<a href="${hub.clusterInfo.gitopsURL}" target="_blank" class="console-link">🔄 GitOps</a>` : '<span></span>'}
                    </div>
                    ` : ''}
                    <div style="display: flex; gap: 8px; margin-top: 12px;">
                        <button class="btn btn-secondary" onclick="refreshHub('${hub.name}')" style="flex: 0 0 auto; padding: 10px 16px;" title="Refresh this hub">
                            🔄
                        </button>
                        <button class="btn btn-primary" onclick="showHubDetails('${hub.name}')" style="flex: 1;">
                            View Details
                        </button>
                    </div>
                </div>
            `;
        });
        html += '</div>';
    } else {
        // Empty state
        html += `
            <div class="card" style="padding: 40px; text-align: center; background: var(--bg-tertiary);">
                <div style="font-size: 48px; margin-bottom: 15px; opacity: 0.5;">📦</div>
                <h3 style="color: var(--text-secondary); margin-bottom: 10px;">No Unmanaged Hubs</h3>
                <p style="color: var(--text-secondary); margin-bottom: 20px;">
                    ${managedHubs.length === 0 ? 'No hubs discovered automatically.' : 'Add external hub clusters by providing their kubeconfig.'}<br>
                    ${managedHubs.length === 0 ? 'Add your first hub to start monitoring.' : 'These hubs will be monitored without being managed by this Global Hub.'}
                </p>
                <button class="btn btn-primary" onclick="showAddHubForm()" style="padding: 12px 24px;">
                    ➕ Add Your First Hub
                </button>
            </div>
        `;
    }
    
    html += '</div></div>'; // Close unmanaged-hubs-section and container div
    
    document.getElementById('app').innerHTML = html;
}

// Show hub details
async function showHubDetails(hubName) {
    selectedHub = hubName;
    currentView = 'hubDetail';
    const app = document.getElementById('app');
    app.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading hub details...</p></div>';
    
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
    
    // Calculate merged node count (unique hostnames)
    const uniqueHostnames = new Set();
    (hub.nodesInfo || []).forEach(node => {
        uniqueHostnames.add(node.name.split('.')[0]);
    });
    const nodeCount = uniqueHostnames.size;
    
    // Calculate unique operator count (grouped by displayName)
    const uniqueOperatorNames = new Set();
    (hub.operatorsInfo || []).forEach(op => {
        uniqueOperatorNames.add(op.displayName || op.name);
    });
    const uniqueOperatorCount = uniqueOperatorNames.size;
    
    let html = `
        <button class="back-button" onclick="returnToHomepage()">← Back to Hubs</button>
        
        <h2 class="section-title">
            ${hub.name}
            <span class="status ${statusClass}" style="margin-left: 16px;">${hub.status}</span>
        </h2>
        
        <div class="tabs">
            <button class="tab active" onclick="switchTab(0, '${hub.name}')">Overview</button>
            <button class="tab" onclick="switchTab(1, '${hub.name}')">Nodes (${nodeCount})</button>
            ${(hub.annotations?.source !== 'manual' || policyCount > 0) ? `<button class="tab" onclick="switchTab(2, '${hub.name}')">Policies (${policyCount})</button>` : ''}
            <button class="tab" onclick="switchTab(${hub.annotations?.source === 'manual' && policyCount === 0 ? 2 : 3}, '${hub.name}')">Operators (${uniqueOperatorCount})</button>
            <button class="tab" onclick="switchTab(${hub.annotations?.source === 'manual' && policyCount === 0 ? 3 : 4}, '${hub.name}')">Spoke Clusters (${spokeCount})</button>
        </div>
        
        <div class="tab-content active" id="tab-0">
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
    return `
        <div class="card">
            <h3>Cluster Information</h3>
            <div class="info-row"><span class="label">Name:</span> <span class="value">${hub.name}</span></div>
            <div class="info-row"><span class="label">Status:</span> <span class="value"><span class="status ${hub.status.toLowerCase().includes('ready') || hub.status.toLowerCase().includes('connected') ? 'ready' : 'notready'}">${hub.status}</span></span></div>
            <div class="info-row"><span class="label">Kubernetes Version:</span> <span class="value">${hub.version || 'N/A'}</span></div>
            <div class="info-row"><span class="label">OpenShift Version:</span> <span class="value">${hub.clusterInfo.openshiftVersion || 'N/A'}</span></div>
            <div class="info-row"><span class="label">Platform:</span> <span class="value">${hub.clusterInfo.platform || 'N/A'}</span></div>
            ${hub.clusterInfo.region ? `
            <div class="info-row">
                <span class="label">Configuration Version:</span>
                <span class="value"><strong class="config-badge" style="padding: 4px 12px; font-size: 14px;">${hub.clusterInfo.region}</strong></span>
            </div>
            ` : ''}
            <div class="info-row"><span class="label">Cluster ID:</span> <span class="value"><small style="font-family: monospace;">${hub.clusterInfo.clusterID}</small></span></div>
            ${hub.clusterInfo.consoleURL ? `
            <div class="info-row">
                <span class="label">Console URL:</span>
                <span class="value"><a href="${hub.clusterInfo.consoleURL}" target="_blank">${hub.clusterInfo.consoleURL}</a></span>
            </div>
            ` : ''}
            ${hub.clusterInfo.gitopsURL ? `
            <div class="info-row">
                <span class="label">GitOps Console:</span>
                <span class="value"><a href="${hub.clusterInfo.gitopsURL}" target="_blank">${hub.clusterInfo.gitopsURL}</a></span>
            </div>
            ` : ''}
            <div class="info-row"><span class="label">Created:</span> <span class="value">${new Date(hub.createdAt).toLocaleString()}</span></div>
        </div>
    `;
}

// Render spoke clusters - table view for scalability
function renderSpokes(spokes, hubName) {
    if (spokes.length === 0) {
        return '<div class="empty-state"><div class="empty-state-icon">📦</div><p>No spoke clusters found for this hub</p></div>';
    }
    
    let html = `
        <div class="card" style="margin-bottom: 20px; padding: 20px;">
            <div style="display: grid; grid-template-columns: repeat(3, 1fr) auto; gap: 15px; align-items: end;">
                <div>
                    <label style="display: block; margin-bottom: 5px; font-weight: 600; color: var(--text-secondary);">🔍 Search by Cluster Name</label>
                    <input type="text" id="search-cluster-name" placeholder="Enter cluster name..." 
                           style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 4px; font-size: 14px; background: var(--bg-secondary); color: var(--text-primary);"
                           onkeyup="filterSpokes()">
                </div>
                <div>
                    <label style="display: block; margin-bottom: 5px; font-weight: 600; color: var(--text-secondary);">🏷️ Search by Version</label>
                    <input type="text" id="search-version" placeholder="e.g., 4.18.13..." 
                           style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 4px; font-size: 14px; background: var(--bg-secondary); color: var(--text-primary);"
                           onkeyup="filterSpokes()">
                </div>
                <div>
                    <label style="display: block; margin-bottom: 5px; font-weight: 600; color: var(--text-secondary);">⚙️ Search by Configuration</label>
                    <input type="text" id="search-configuration" placeholder="e.g., vdu2-4.18..." 
                           style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 4px; font-size: 14px; background: var(--bg-secondary); color: var(--text-primary);"
                           onkeyup="filterSpokes()">
                </div>
                <div>
                    <button class="btn btn-secondary" onclick="clearSpokeSearch()" style="padding: 10px 20px;">
                        ✕ Clear
                    </button>
                </div>
            </div>
            <div id="spoke-count" style="margin-top: 15px; color: var(--text-secondary); font-size: 14px;">
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
                        <th>Platform</th>
                        <th>Nodes</th>
                        <th>Operators</th>
                        <th>Policies</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    spokes.forEach((spoke, spokeIndex) => {
        const status = spoke.status.toLowerCase();
        const statusClass = status === 'ready' ? 'ready' : (status === 'unknown' ? 'unknown' : 'notready');
        const policyCount = spoke.policiesInfo?.length || 0;
        const nodeCount = spoke.nodesInfo?.length || 0;
        const compliantPolicies = (spoke.policiesInfo || []).filter(p => p.complianceState === 'Compliant').length;
        const spokeDetailId = `spoke-detail-${spokeIndex}`;
        
        // Operators are lazy loaded, don't show count in table
        const uniqueOperatorCount = '...';
        
        html += `
            <tr class="spoke-row" data-cluster-name="${spoke.name.toLowerCase()}" data-version="${(spoke.clusterInfo.openshiftVersion || '').toLowerCase()}" data-configuration="${(spoke.clusterInfo.region || '').toLowerCase()}">
                <td><strong>${spoke.name}</strong></td>
                <td><span class="status ${statusClass}">${spoke.status}</span></td>
                <td>${spoke.clusterInfo.openshiftVersion || 'N/A'}</td>
                <td><code class="config-badge">${spoke.clusterInfo.region || 'N/A'}</code></td>
                <td>${spoke.clusterInfo.platform || 'N/A'}</td>
                <td><span class="badge">${nodeCount}</span></td>
                <td><span class="badge" style="background: var(--badge-blue-bg); color: var(--badge-blue-text); font-size: 12px;">...</span></td>
                <td><span class="badge ${compliantPolicies === policyCount ? 'success' : 'warning'}">${compliantPolicies}/${policyCount}</span></td>
                <td>
                    <button class="btn btn-primary" style="padding: 6px 16px; font-size: 13px;" onclick="toggleSpokeDetails('${spokeDetailId}', '${hubName}', '${spoke.name}')">
                        📊 Details
                    </button>
                </td>
            </tr>
            <tr id="${spokeDetailId}" class="spoke-detail-row" style="display: none;">
                <td colspan="9" style="padding: 0;">
                    ${renderSpokeDetails(spoke, hubName)}
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

// Toggle spoke details visibility and lazy load operators
async function toggleSpokeDetails(id, hubName, spokeName) {
    const element = document.getElementById(id);
    if (element) {
        if (element.style.display === 'none') {
            element.style.display = 'table-row';
            
            // Lazy load operators on first expansion
            const operatorsCell = element.querySelector('.lazy-operators');
            if (operatorsCell && operatorsCell.textContent.trim().includes('Loading')) {
                try {
                    console.log(`Fetching operators for ${spokeName} from hub ${hubName}...`);
                    const response = await fetch(`${API_BASE}/hubs/${hubName}/spokes/${spokeName}/operators`);
                    const data = await response.json();
                    console.log('Operators response:', data);
                    if (data.success && data.data) {
                        // Update the operators section with fetched data
                        updateSpokeOperators(id, data.data);
                    } else {
                        operatorsCell.textContent = 'N/A';
                    }
                } catch (error) {
                    console.error('Error loading spoke operators:', error);
                    operatorsCell.textContent = 'Error: ' + error.message;
                }
            }
        } else {
            element.style.display = 'none';
        }
    }
}

// Update spoke operators after lazy loading
function updateSpokeOperators(spokeDetailId, operators) {
    const element = document.getElementById(spokeDetailId);
    if (!element) return;
    
    const operatorCount = operators.length;
    
    // Group operators by name
    const operatorMap = new Map();
    operators.forEach(op => {
        const key = op.displayName || op.name;
        if (!operatorMap.has(key)) {
            operatorMap.set(key, {
                displayName: op.displayName || op.name,
                version: op.version,
                namespaces: [],
                phase: op.phase
            });
        }
        operatorMap.get(key).namespaces.push(op.namespace);
    });
    
    const uniqueOperators = Array.from(operatorMap.values());
    
    // Update stat card
    const statCard = element.querySelector('.lazy-operators-stat');
    if (statCard) {
        statCard.innerHTML = `<div class="spoke-stat-label" style="color: var(--badge-blue-text);">Operators</div><div style="font-size: 20px; font-weight: 700; color: var(--badge-blue-text);">${uniqueOperators.length}</div>`;
    }
    
    // Update operators section
    const operatorsSection = element.querySelector('.lazy-operators');
    if (operatorsSection && operatorCount > 0) {
        const tableHtml = `
            <table style="width: 100%; font-size: 12px;">
                <thead>
                    <tr>
                        <th>Operator</th>
                        <th>Version</th>
                        <th>Namespace</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${uniqueOperators.slice(0, 10).map(op => `
                        <tr>
                            <td><strong>${op.displayName}</strong></td>
                            <td><code class="config-badge" style="font-size: 10px;">${op.version || 'N/A'}</code></td>
                            <td style="font-size: 11px;">${op.namespaces.length === 1 ? op.namespaces[0] : `<span class="badge" style="font-size: 10px;">${op.namespaces.length} ns</span>`}</td>
                            <td><span class="status ${op.phase === 'Succeeded' ? 'ready' : 'notready'}" style="font-size: 10px; padding: 2px 8px;">${op.phase || 'Unknown'}</span></td>
                        </tr>
                    `).join('')}
                    ${uniqueOperators.length > 10 ? `<tr><td colspan="4" style="text-align: center; color: var(--text-secondary); font-size: 11px; padding: 8px;">... and ${uniqueOperators.length - 10} more operators</td></tr>` : ''}
                </tbody>
            </table>
        `;
        operatorsSection.innerHTML = tableHtml;
    } else if (operatorsSection) {
        operatorsSection.innerHTML = '<p style="color: var(--text-secondary); font-size: 12px; text-align: center; padding: 10px;">No operators installed</p>';
    }
}

// Render spoke details (expandable section)
function renderSpokeDetails(spoke, hubName) {
    const policyCount = spoke.policiesInfo?.length || 0;
    const compliantPolicies = (spoke.policiesInfo || []).filter(p => p.complianceState === 'Compliant').length;
    // Operators will be lazy loaded
    const operatorCount = 0;
    
    return `
        <div style="padding: 15px;">
            <!-- Compact Info Grid -->
            <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 12px; margin-bottom: 15px;">
                <div class="spoke-stat-card">
                    <div class="spoke-stat-label">Type</div>
                    <div class="spoke-stat-value">SNO</div>
                </div>
                <div class="spoke-stat-card">
                    <div class="spoke-stat-label">OpenShift</div>
                    <div class="spoke-stat-value">${spoke.clusterInfo.openshiftVersion || 'N/A'}</div>
                </div>
                <div class="spoke-stat-card">
                    <div class="spoke-stat-label">Kubernetes</div>
                    <div class="spoke-stat-value">${spoke.version || 'N/A'}</div>
                </div>
                <div class="spoke-stat-card">
                    <div class="spoke-stat-label">Platform</div>
                    <div class="spoke-stat-value">${spoke.clusterInfo.platform || 'N/A'}</div>
                </div>
                <div class="spoke-stat-card">
                    <div class="spoke-stat-label">Config</div>
                    <div class="spoke-stat-value">${spoke.clusterInfo.region || 'N/A'}</div>
                </div>
                <div class="spoke-stat-card" style="background: ${compliantPolicies === policyCount ? 'var(--badge-green-bg)' : 'var(--status-notready-bg)'}; border-color: ${compliantPolicies === policyCount ? 'var(--badge-green-text)' : 'var(--status-notready-text)'};">
                    <div class="spoke-stat-label" style="color: ${compliantPolicies === policyCount ? 'var(--badge-green-text)' : 'var(--status-notready-text)'};">Policies</div>
                    <div style="font-size: 20px; font-weight: 700; color: ${compliantPolicies === policyCount ? 'var(--badge-green-text)' : 'var(--status-notready-text)'};">${compliantPolicies}/${policyCount}</div>
                </div>
                <div class="spoke-stat-card lazy-operators-stat" style="background: var(--badge-blue-bg); border-color: var(--badge-blue-text);">
                    <div class="spoke-stat-label" style="color: var(--badge-blue-text);">Operators</div>
                    <div style="font-size: 20px; font-weight: 700; color: var(--badge-blue-text);">...</div>
                </div>
            </div>
            
            ${(spoke.nodesInfo && spoke.nodesInfo.length > 0) ? `
            <div style="margin-bottom: 15px;">
                <h4 style="color: var(--text-link); margin-bottom: 10px; font-size: 15px;">💻 Hardware Inventory</h4>
                ${renderSpokeHardwareCompact(spoke.nodesInfo)}
            </div>
            ` : ''}
            
            <div style="margin-bottom: 15px;">
                <h4 style="color: var(--text-link); margin-bottom: 10px; font-size: 15px;">🔧 Operators</h4>
                <div class="lazy-operators" style="max-height: 200px; overflow-y: auto; color: var(--text-secondary); text-align: center; padding: 20px;">
                    Loading...
                </div>
            </div>
            
            ${policyCount > 0 ? `
            <div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <h4 style="color: var(--text-link); margin: 0; font-size: 15px;">📋 Policies (${policyCount} total, ${compliantPolicies} compliant)</h4>
                </div>
                
                <div class="policy-summary-card" style="margin-bottom: 15px;">
                    <div style="display: flex; gap: 12px; align-items: center;">
                        <div style="flex: 1;">
                            <input type="text" id="search-spoke-policy-name" placeholder="🔍 Search policy name..." 
                                   style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; font-size: 13px; background: var(--bg-secondary); color: var(--text-primary);"
                                   onkeyup="filterSpokePolicies()">
                        </div>
                        <div style="display: flex; gap: 10px;">
                            <label style="display: flex; align-items: center; cursor: pointer; font-size: 13px;">
                                <input type="radio" name="spoke-compliance-filter" value="" checked onchange="filterSpokePolicies()" style="margin-right: 4px;">All
                            </label>
                            <label style="display: flex; align-items: center; cursor: pointer; font-size: 13px;">
                                <input type="radio" name="spoke-compliance-filter" value="compliant" onchange="filterSpokePolicies()" style="margin-right: 4px;">
                                <span style="color: #3e8635;">✓</span>
                            </label>
                            <label style="display: flex; align-items: center; cursor: pointer; font-size: 13px;">
                                <input type="radio" name="spoke-compliance-filter" value="noncompliant" onchange="filterSpokePolicies()" style="margin-right: 4px;">
                                <span style="color: #c9190b;">✗</span>
                            </label>
                        </div>
                        <button class="btn btn-secondary" onclick="clearSpokePolicySearch()" style="padding: 6px 12px; font-size: 12px;">✕</button>
                    </div>
                    <div id="spoke-policy-count" style="margin-top: 8px; color: #6a6e73; font-size: 12px;">
                        Showing ${policyCount} ${policyCount !== 1 ? 'policies' : 'policy'}
                    </div>
                </div>
                
                ${renderSpokePolicyList(spoke.policiesInfo || [], hubName)}
            </div>
            ` : ''}
        </div>
    `;
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
            // Also show the detail row if it was visible
            const detailRow = row.nextElementSibling;
            if (detailRow && detailRow.classList.contains('spoke-detail-row')) {
                // Keep detail row visibility state
            }
            visibleCount++;
        } else {
            row.style.display = 'none';
            // Hide the detail row too
            const detailRow = row.nextElementSibling;
            if (detailRow && detailRow.classList.contains('spoke-detail-row')) {
                detailRow.style.display = 'none';
            }
        }
    });
    
    // Update count
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
            // Hide the detail row too
            const detailRow = row.nextElementSibling;
            if (detailRow && detailRow.classList.contains('policy-detail-row')) {
                detailRow.style.display = 'none';
            }
        }
    });
    
    // Update count
    const countEl = document.getElementById('policy-count');
    if (countEl) {
        const total = rows.length;
        if (visibleCount === total) {
            countEl.textContent = `Showing ${total} ${total !== 1 ? 'policies' : 'policy'}`;
        } else {
            countEl.textContent = `Showing ${visibleCount} of ${total} ${total !== 1 ? 'policies' : 'policy'}`;
        }
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

// Filter spoke policies in detail view
function filterSpokePolicies() {
    const nameSearch = document.getElementById('search-spoke-policy-name')?.value.toLowerCase() || '';
    const selectedRadio = document.querySelector('input[name="spoke-compliance-filter"]:checked');
    const complianceFilter = selectedRadio?.value.toLowerCase() || '';
    
    const rows = document.querySelectorAll('.spoke-policy-row');
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
    
    // Update count
    const countEl = document.getElementById('spoke-policy-count');
    if (countEl) {
        const total = rows.length;
        if (visibleCount === total) {
            countEl.textContent = `Showing ${total} ${total !== 1 ? 'policies' : 'policy'}`;
        } else {
            countEl.textContent = `Showing ${visibleCount} of ${total} ${total !== 1 ? 'policies' : 'policy'}`;
        }
    }
}

// Clear spoke policy search filters
function clearSpokePolicySearch() {
    const nameInput = document.getElementById('search-spoke-policy-name');
    const allRadio = document.querySelector('input[name="spoke-compliance-filter"][value=""]');
    if (nameInput) nameInput.value = '';
    if (allRadio) allRadio.checked = true;
    filterSpokePolicies();
}

// Enforce policy by creating a ClusterGroupUpgrade
async function enforcePolicyWithCGU(policy, hubName) {
    try {
        // Confirm action
        const clusterName = policy.namespace;
        const confirm = window.confirm(
            `Create ClusterGroupUpgrade to enforce policy?\n\n` +
            `Cluster: ${clusterName}\n` +
            `Policy: ${policy.name}\n` +
            `Current State: ${policy.complianceState}\n\n` +
            `This will create a CGU resource to remediate the policy.`
        );
        
        if (!confirm) return;
        
        // Call backend to create CGU
        const response = await fetch(`${API_BASE}/cgu/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
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
                `✅ ClusterGroupUpgrade created successfully!\n\n` +
                `CGU Name: ${data.data.cguName}\n` +
                `Namespace: ${data.data.namespace}\n` +
                `Cluster: ${data.data.cluster}\n` +
                `Policy: ${data.data.policy}\n\n` +
                `The policy will be enforced via TALM.`
            );
        } else {
            alert('❌ Failed to create CGU: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        alert('❌ Error creating CGU: ' + error.message);
    }
}

// Download policy as YAML from the cluster
async function downloadPolicyYAML(policy, hubName) {
    try {
        // Build URL with optional hub parameter for spoke policies
        let url = `${API_BASE}/policies/${policy.namespace}/${policy.name}/yaml`;
        if (hubName) {
            url += `?hub=${hubName}`;
        }
        
        // Fetch actual policy YAML from backend
        const response = await fetch(url);
        
        if (!response.ok) {
            alert('Failed to download policy YAML: ' + response.statusText);
            return;
        }
        
        // Get filename from Content-Disposition header
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = `${policy.namespace}_${policy.name}.yaml`; // Default fallback
        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
            if (filenameMatch && filenameMatch[1]) {
                filename = filenameMatch[1];
            }
        }
        
        const yamlContent = await response.text();
        
        // Create blob and download
        const blob = new Blob([yamlContent], { type: 'text/yaml' });
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = filename; // Use filename from server
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
        if (element.style.display === 'none') {
            element.style.display = 'block';
        } else {
            element.style.display = 'none';
        }
    }
}

// Toggle spoke policy details
function toggleSpokePolicyDetails(id) {
    const element = document.getElementById(id);
    if (element) {
        if (element.style.display === 'none') {
            element.style.display = 'table-row';
        } else {
            element.style.display = 'none';
        }
    }
}

// Render spoke policy list (compact version)
function renderSpokePolicyList(policies, hubName) {
    if (policies.length === 0) return '<p>No policies</p>';
    
    // Sort policies by wave number (ascending)
    const sortedPolicies = [...policies].sort((a, b) => {
        const waveA = parseInt(a.annotations?.['ran.openshift.io/ztp-deploy-wave'] || '999');
        const waveB = parseInt(b.annotations?.['ran.openshift.io/ztp-deploy-wave'] || '999');
        return waveA - waveB;
    });
    
    let html = `
        <table style="width: 100%; font-size: 13px;">
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
        const policyName = policy.name.split('.').pop() || policy.name;
        const complianceClass = policy.complianceState?.toLowerCase() === 'compliant' ? 'policy-compliant' : 'policy-noncompliant';
        const remediationClass = policy.remediationAction === 'enforce' ? 'policy-enforce' : 'policy-inform';
        const ztpWave = policy.annotations?.['ran.openshift.io/ztp-deploy-wave'] || 'N/A';
        const spokePolicyDetailId = `spoke-policy-detail-${index}`;
        
        html += `
            <tr class="spoke-policy-row" data-policy-name="${policy.name.toLowerCase()}" data-compliance="${(policy.complianceState || '').toLowerCase()}">
                <td><strong>${policyName}</strong></td>
                <td><span class="policy-badge ${complianceClass}">${policy.complianceState || 'Unknown'}</span></td>
                <td><span class="policy-badge ${remediationClass}">${policy.remediationAction || 'N/A'}</span></td>
                <td><span class="badge" style="background: #f0ab00;">${ztpWave}</span></td>
                <td>
                    <button class="btn btn-secondary" style="padding: 4px 10px; font-size: 12px; margin-right: 4px;" onclick="toggleSpokePolicyDetails('${spokePolicyDetailId}')">
                        📄 Details
                    </button>
                    <button class="btn btn-primary" style="padding: 4px 10px; font-size: 12px; margin-right: 4px;" onclick='downloadPolicyYAML(${JSON.stringify(policy).replace(/'/g, "&#39;")}, "${hubName}")'>
                        ⬇️ YAML
                    </button>
                    ${policy.complianceState?.toLowerCase() !== 'compliant' ? `
                    <button class="btn" style="padding: 4px 10px; font-size: 12px; background: #f0ab00; color: white; border: none; border-radius: 4px; cursor: pointer;" onclick='enforcePolicyWithCGU(${JSON.stringify(policy).replace(/'/g, "&#39;")}, "${hubName}")'>
                        ⚡ Enforce
                    </button>
                    ` : ''}
                </td>
            </tr>
            <tr id="${spokePolicyDetailId}" style="display: none;" class="spoke-policy-detail-row">
                <td colspan="5" style="padding: 15px;">
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
    
    let html = '<div class="node-hardware"><h4>Hardware Inventory</h4>';
    nodes.forEach(node => {
        html += `
            <div class="hardware-grid">
                <div class="hardware-item">
                    <span class="hardware-label">💻 CPU:</span>
                    ${node.capacity?.cpu || 'N/A'}
                </div>
                <div class="hardware-item">
                    <span class="hardware-label">🧠 RAM:</span>
                    ${node.capacity?.memory || 'N/A'}
                </div>
                <div class="hardware-item">
                    <span class="hardware-label">💾 Storage:</span>
                    ${node.capacity?.storage || 'N/A'}
                </div>
                <div class="hardware-item">
                    <span class="hardware-label">🌐 IP:</span>
                    ${node.internalIP || 'N/A'}
                </div>
                ${node.annotations?.['bmc-address'] ? `
                <div class="hardware-item" style="grid-column: 1 / 3; font-size: 13px;">
                    <span class="hardware-label">🔧 BMC:</span>
                    <small style="font-family: monospace; font-size: 11px;">${node.annotations['bmc-address']}</small>
                </div>
                ` : ''}
                ${node.annotations?.manufacturer ? `
                <div class="hardware-item" style="font-size: 13px;">
                    <span class="hardware-label">🏭 Vendor:</span>
                    ${node.annotations.manufacturer}
                </div>
                ` : ''}
                ${node.annotations?.['serial-number'] ? `
                <div class="hardware-item" style="font-size: 13px;">
                    <span class="hardware-label">📋 S/N:</span>
                    <small style="font-family: monospace;">${node.annotations['serial-number']}</small>
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
    
    let html = '<div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; font-size: 13px;">';
    nodes.forEach(node => {
        html += `
            <div class="hardware-grid-item">
                <strong>💻 CPU:</strong> ${node.capacity?.cpu || 'N/A'}
            </div>
            <div class="hardware-grid-item">
                <strong>🧠 RAM:</strong> ${node.capacity?.memory || 'N/A'}
            </div>
            <div class="hardware-grid-item">
                <strong>💾 Storage:</strong> ${node.capacity?.storage || 'N/A'}
            </div>
            <div class="hardware-grid-item">
                <strong>🌐 IP:</strong> ${node.internalIP || 'N/A'}
            </div>
            ${node.annotations?.['bmc-address'] ? `
            <div class="hardware-grid-item" style="grid-column: 1 / 3;">
                <strong>🔧 BMC:</strong> <code style="font-size: 11px;">${node.annotations['bmc-address']}</code>
            </div>
            ` : ''}
            ${node.annotations?.manufacturer ? `
            <div class="hardware-grid-item">
                <strong>🏭 Vendor:</strong> ${node.annotations.manufacturer}
            </div>
            ` : ''}
            ${node.annotations?.['serial-number'] ? `
            <div class="hardware-grid-item">
                <strong>📋 S/N:</strong> <code>${node.annotations['serial-number']}</code>
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
        return '<div class="empty-state"><div class="empty-state-icon">🖥️</div><p>No node information available</p></div>';
    }
    
    // Group nodes by hostname (merge K8s and BMH data)
    const nodeMap = new Map();
    
    nodes.forEach(node => {
        // Extract hostname (remove domain)
        const hostname = node.name.split('.')[0];
        
        if (!nodeMap.has(hostname)) {
            nodeMap.set(hostname, {
                hostname: hostname,
                fullName: node.name,
                k8sNode: null,
                bmhNode: null
            });
        }
        
        const nodeData = nodeMap.get(hostname);
        if (node.annotations?.['data-source'] === 'Node') {
            nodeData.k8sNode = node;
        } else {
            nodeData.bmhNode = node;
        }
    });
    
    // Render merged nodes
    let html = '<div class="grid">';
    
    nodeMap.forEach((nodeData) => {
        html += renderMergedNodeCard(nodeData);
    });
    
    html += '</div>';
    return html;
}

// Render a merged node card with both K8s and BMH info
function renderMergedNodeCard(nodeData) {
    const node = nodeData.k8sNode || nodeData.bmhNode;
    const statusClass = node.status.toLowerCase().includes('ready') ? 'ready' : 'notready';
    
    return `
        <div class="card">
            <h3>
                <span>${nodeData.hostname}</span>
                <span class="status ${statusClass}">${node.status}</span>
            </h3>
            
            ${nodeData.k8sNode ? `
            <div class="k8s-section">
                <h4>📋 Kubernetes Node Info</h4>
                <div class="info-row">
                    <span class="label">Role:</span>
                    <span class="value">${nodeData.k8sNode.role || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="label">Status:</span>
                    <span class="value"><span class="status ${statusClass}">${nodeData.k8sNode.status}</span></span>
                </div>
                <div class="info-row">
                    <span class="label">Kubelet:</span>
                    <span class="value">${nodeData.k8sNode.kubeletVersion || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="label">OS:</span>
                    <span class="value">${nodeData.k8sNode.osImage || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="label">Kernel:</span>
                    <span class="value">${nodeData.k8sNode.kernelVersion || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="label">Container Runtime:</span>
                    <span class="value">${nodeData.k8sNode.containerRuntime || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="label">IP Address:</span>
                    <span class="value"><code>${nodeData.k8sNode.internalIP || 'N/A'}</code></span>
                </div>
            </div>
            ` : ''}
            
            ${nodeData.bmhNode ? `
            <div class="hardware-section">
                <h4>🔧 Hardware Info (BareMetalHost)</h4>
                <div class="info-row">
                    <span class="label">CPU:</span>
                    <span class="value"><strong>${nodeData.bmhNode.capacity?.cpu || 'N/A'}</strong></span>
                </div>
                ${nodeData.bmhNode.annotations?.['cpu-model'] ? `
                <div class="info-row">
                    <span class="label">CPU Model:</span>
                    <span class="value"><small>${nodeData.bmhNode.annotations['cpu-model']}</small></span>
                </div>
                ` : ''}
                <div class="info-row">
                    <span class="label">RAM:</span>
                    <span class="value"><strong>${nodeData.bmhNode.capacity?.memory || 'N/A'}</strong></span>
                </div>
                <div class="info-row">
                    <span class="label">Storage:</span>
                    <span class="value"><strong>${nodeData.bmhNode.capacity?.storage || 'N/A'}</strong></span>
                </div>
                ${nodeData.bmhNode.annotations?.['bmc-address'] ? `
                <div class="info-row">
                    <span class="label">BMC:</span>
                    <span class="value"><small style="font-family: monospace; word-break: break-all;">${nodeData.bmhNode.annotations['bmc-address']}</small></span>
                </div>
                ` : ''}
                ${nodeData.bmhNode.annotations?.manufacturer ? `
                <div class="info-row">
                    <span class="label">Manufacturer:</span>
                    <span class="value">${nodeData.bmhNode.annotations.manufacturer}</span>
                </div>
                ` : ''}
                ${nodeData.bmhNode.annotations?.['product-name'] ? `
                <div class="info-row">
                    <span class="label">Product:</span>
                    <span class="value"><small>${nodeData.bmhNode.annotations['product-name']}</small></span>
                </div>
                ` : ''}
                ${nodeData.bmhNode.annotations?.['serial-number'] ? `
                <div class="info-row">
                    <span class="label">Serial Number:</span>
                    <span class="value"><code>${nodeData.bmhNode.annotations['serial-number']}</code></span>
                </div>
                ` : ''}
                ${nodeData.bmhNode.annotations?.['nic-count'] ? `
                <div class="info-row">
                    <span class="label">Network:</span>
                    <span class="value">${nodeData.bmhNode.annotations['nic-count']} NICs, IP: ${nodeData.bmhNode.internalIP || 'N/A'}</span>
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
    const sourceLabel = type === 'kubernetes' ? '📋 K8s Node' : '🔧 BMH';
    return `
        <div class="card">
            <h3>
                <span>${node.name.split('.')[0]}</span>
                <span class="status ${statusClass}">${node.status}</span>
            </h3>
            <div class="k8s-section" style="margin-bottom: 12px; padding: 6px 10px; font-size: 13px; font-weight: 600;">
                ${sourceLabel}
            </div>
                <div class="info-row">
                    <span class="label">Role:</span>
                    <span class="value">${node.role || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="label">CPU:</span>
                    <span class="value"><strong>${node.capacity?.cpu || 'N/A'}</strong></span>
                </div>
                ${node.annotations?.['cpu-model'] ? `
                <div class="info-row">
                    <span class="label">CPU Model:</span>
                    <span class="value"><small>${node.annotations['cpu-model']}</small></span>
                </div>
                ` : ''}
                <div class="info-row">
                    <span class="label">RAM:</span>
                    <span class="value"><strong>${node.capacity?.memory || 'N/A'}</strong></span>
                </div>
                <div class="info-row">
                    <span class="label">Storage:</span>
                    <span class="value"><strong>${node.capacity?.storage || 'N/A'}</strong></span>
                </div>
                ${renderDiskDetails(node)}
                <div class="info-row">
                    <span class="label">IP Address:</span>
                    <span class="value"><code>${node.internalIP || 'N/A'}</code></span>
                </div>
                ${node.annotations?.['bmc-address'] ? `
                <div class="info-row">
                    <span class="label">BMC Address:</span>
                    <span class="value"><small style="font-family: monospace; word-break: break-all;">${node.annotations['bmc-address']}</small></span>
                </div>
                ` : ''}
                ${node.annotations?.manufacturer ? `
                <div class="info-row">
                    <span class="label">Manufacturer:</span>
                    <span class="value">${node.annotations.manufacturer}</span>
                </div>
                ` : ''}
                ${node.annotations?.['product-name'] ? `
                <div class="info-row">
                    <span class="label">Product:</span>
                    <span class="value"><small>${node.annotations['product-name']}</small></span>
                </div>
                ` : ''}
                ${node.annotations?.['serial-number'] ? `
                <div class="info-row">
                    <span class="label">Serial Number:</span>
                    <span class="value"><code>${node.annotations['serial-number']}</code></span>
                </div>
                ` : ''}
                ${node.annotations?.['nic-count'] ? `
                <div class="info-row">
                    <span class="label">Network Interfaces:</span>
                    <span class="value">${node.annotations['nic-count']} NICs</span>
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
                    <span class="label">Disk ${i}:</span>
                    <span class="value"><small style="font-family: monospace;">${node.annotations[diskKey]}</small></span>
                </div>
            `;
        }
    }
    return html;
}

// Render policies table
function renderPolicies(policies) {
    if (policies.length === 0) {
        return '<div class="empty-state"><div class="empty-state-icon">📋</div><p>No policies found</p></div>';
    }
    
    // Sort policies by wave number (ascending)
    const sortedPolicies = [...policies].sort((a, b) => {
        const waveA = parseInt(a.annotations?.['ran.openshift.io/ztp-deploy-wave'] || '999');
        const waveB = parseInt(b.annotations?.['ran.openshift.io/ztp-deploy-wave'] || '999');
        return waveA - waveB;
    });
    
    const compliantCount = sortedPolicies.filter(p => p.complianceState === 'Compliant').length;
    
    let html = `
        <div class="card compliance-card">
            <div style="text-align: center;">
                <h3>Policy Compliance</h3>
                <div class="compliance-number">${compliantCount}/${sortedPolicies.length}</div>
                <p class="compliance-text">Policies Compliant</p>
            </div>
        </div>
        
        <div class="card" style="margin-bottom: 20px; padding: 20px;">
            <div style="display: flex; gap: 15px; align-items: center;">
                <div style="flex: 1;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #6a6e73;">🔍 Search by Policy Name</label>
                    <input type="text" id="search-policy-name" placeholder="Enter policy name..." 
                           style="width: 100%; padding: 10px; border: 1px solid #d2d2d2; border-radius: 4px; font-size: 14px;"
                           onkeyup="filterPolicies()">
                </div>
                <div style="flex: 1;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #6a6e73;">✅ Filter by Compliance</label>
                    <div style="display: flex; gap: 15px; align-items: center; padding: 10px;">
                        <label style="display: flex; align-items: center; cursor: pointer;">
                            <input type="radio" name="compliance-filter" value="" checked onchange="filterPolicies()" style="margin-right: 6px; cursor: pointer;">
                            <span>All</span>
                        </label>
                        <label style="display: flex; align-items: center; cursor: pointer;">
                            <input type="radio" name="compliance-filter" value="compliant" onchange="filterPolicies()" style="margin-right: 6px; cursor: pointer;">
                            <span style="color: #3e8635;">Compliant</span>
                        </label>
                        <label style="display: flex; align-items: center; cursor: pointer;">
                            <input type="radio" name="compliance-filter" value="noncompliant" onchange="filterPolicies()" style="margin-right: 6px; cursor: pointer;">
                            <span style="color: #c9190b;">NonCompliant</span>
                        </label>
                    </div>
                </div>
                <div style="padding-top: 28px;">
                    <button class="btn btn-secondary" onclick="clearPolicySearch()" style="padding: 10px 20px;">
                        ✕ Clear
                    </button>
                </div>
            </div>
            <div id="policy-count" style="margin-top: 15px; color: #6a6e73; font-size: 14px;">
                Showing ${sortedPolicies.length} ${sortedPolicies.length !== 1 ? 'policies' : 'policy'}
            </div>
        </div>
        
        <div class="card">
            <table id="policies-table">
                <thead>
                    <tr>
                        <th>Policy Name</th>
                        <th>Compliance</th>
                        <th>Remediation</th>
                        <th>Wave</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    sortedPolicies.forEach((policy, index) => {
        const policyName = policy.name.split('.').pop() || policy.name;
        const complianceClass = policy.complianceState?.toLowerCase() === 'compliant' ? 'policy-compliant' : 'policy-noncompliant';
        const remediationClass = policy.remediationAction === 'enforce' ? 'policy-enforce' : 'policy-inform';
        const policyId = `policy-${index}`;
        const ztpWave = policy.annotations?.['ran.openshift.io/ztp-deploy-wave'] || 'N/A';
        
        html += `
            <tr class="policy-row" data-policy-name="${policy.name.toLowerCase()}" data-compliance="${(policy.complianceState || '').toLowerCase()}">
                <td>
                    <strong>${policyName}</strong><br>
                    <small style="color: #6a6e73;">${policy.namespace}</small>
                </td>
                <td><span class="policy-badge ${complianceClass}">${policy.complianceState || 'Unknown'}</span></td>
                <td><span class="policy-badge ${remediationClass}">${policy.remediationAction || 'N/A'}</span></td>
                <td><span class="badge" style="background: #f0ab00;">${ztpWave}</span></td>
                <td>
                    <button class="btn btn-secondary" style="padding: 4px 10px; font-size: 13px; margin-right: 4px;" onclick="showPolicyDetails(${index}, '${policy.name.replace(/'/g, "\\'")}')">
                        📄 Details
                    </button>
                    <button class="btn btn-primary" style="padding: 4px 10px; font-size: 13px; margin-right: 4px;" onclick='downloadPolicyYAML(${JSON.stringify(policy).replace(/'/g, "&#39;")})'>
                        ⬇️ YAML
                    </button>
                    ${policy.complianceState?.toLowerCase() !== 'compliant' ? `
                    <button class="btn" style="padding: 4px 10px; font-size: 13px; background: #f0ab00; color: white; border: none; border-radius: 4px; cursor: pointer;" onclick='enforcePolicyWithCGU(${JSON.stringify(policy).replace(/'/g, "&#39;")}, null)'>
                        ⚡ Enforce
                    </button>
                    ` : ''}
                </td>
            </tr>
            <tr id="${policyId}" class="policy-detail-row" style="display: none;">
                <td colspan="5" style="padding: 12px;">
                    ${renderPolicyDetails(policy)}
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

// Show/hide policy details
function showPolicyDetails(index, policyName) {
    const detailsRow = document.getElementById(`policy-${index}`);
    if (detailsRow) {
        if (detailsRow.style.display === 'none') {
            detailsRow.style.display = 'table-row';
        } else {
            detailsRow.style.display = 'none';
        }
    }
}

// Render policy details
function renderPolicyDetails(policy) {
    return `
        <div>
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 10px;">
                <div class="policy-summary-card" style="padding: 10px;">
                    <div class="policy-summary-label">Namespace</div>
                    <div style="font-size: 14px; font-weight: 600;">${policy.namespace}</div>
                </div>
                <div class="policy-summary-card" style="padding: 10px;">
                    <div class="policy-summary-label">Compliance</div>
                    <div><span class="policy-badge ${policy.complianceState?.toLowerCase() === 'compliant' ? 'policy-compliant' : 'policy-noncompliant'}" style="font-size: 11px;">${policy.complianceState || 'Unknown'}</span></div>
                </div>
                <div class="policy-summary-card" style="padding: 10px;">
                    <div class="policy-summary-label">Remediation</div>
                    <div><span class="policy-badge ${policy.remediationAction === 'enforce' ? 'policy-enforce' : 'policy-inform'}" style="font-size: 11px;">${policy.remediationAction || 'N/A'}</span></div>
                </div>
                <div class="policy-summary-card" style="padding: 10px;">
                    <div class="policy-summary-label">Violations</div>
                    <div style="font-size: 18px; font-weight: 700; color: ${policy.violations > 0 ? 'var(--status-notready-text)' : 'var(--badge-green-text)'};">${policy.violations || 0}</div>
                </div>
            </div>
            
            ${policy.annotations?.['latest-status-message'] ? `
            <div class="${policy.complianceState?.toLowerCase() === 'compliant' ? 'policy-message-compliant' : 'policy-message-noncompliant'}" style="margin-bottom: 12px; padding: 10px; border-radius: 4px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <strong style="color: ${policy.complianceState?.toLowerCase() === 'compliant' ? 'var(--badge-green-text)' : 'var(--status-notready-text)'}; font-size: 13px;">📋 Status Message</strong>
                    <small style="color: var(--text-secondary); font-size: 11px;">🕐 ${policy.annotations['latest-status-timestamp'] ? new Date(policy.annotations['latest-status-timestamp']).toLocaleString() : 'Recent'}</small>
                </div>
                <div class="code-block" style="max-height: 100px; font-size: 11px; padding: 8px;">
${policy.annotations['latest-status-message']}
                </div>
            </div>
            ` : ''}
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <div>
                    <strong style="color: var(--text-link); font-size: 12px; display: block; margin-bottom: 6px;">ℹ️ Additional Info</strong>
                    <div style="font-size: 11px; line-height: 1.6;">
                        <div style="display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid var(--border-color);">
                            <span style="color: var(--text-secondary);">Full Name:</span>
                            <code style="font-size: 9px; word-break: break-all; max-width: 55%;">${policy.name}</code>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid var(--border-color);">
                            <span style="color: var(--text-secondary);">Severity:</span>
                            <span>${policy.severity || 'N/A'}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid var(--border-color);">
                            <span style="color: var(--text-secondary);">Disabled:</span>
                            <span>${policy.disabled ? 'Yes' : 'No'}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 3px 0;">
                            <span style="color: var(--text-secondary);">Created:</span>
                            <span style="font-size: 10px;">${new Date(policy.createdAt).toLocaleDateString()}</span>
                        </div>
                    </div>
                </div>
                <div>
                ${Object.keys(policy.labels || {}).length > 0 ? `
                <div>
                    <strong style="color: var(--text-link); font-size: 12px; display: block; margin-bottom: 6px;">🏷️ Labels (${Object.keys(policy.labels).length})</strong>
                    <div class="code-block" style="font-size: 10px; max-height: 85px; padding: 6px 6px 6px 6px;">${Object.entries(policy.labels).map(([key, value]) => `${key}: ${value}`).join('<br>')}</div>
                </div>
                ` : ''}
                
                ${Object.keys(policy.annotations || {}).length > 0 ? `
                <div style="margin-top: ${Object.keys(policy.labels || {}).length > 0 ? '8px' : '0'};">
                    <strong style="color: var(--text-link); font-size: 12px; display: block; margin-bottom: 6px;">📝 Annotations (${Object.keys(policy.annotations).length})</strong>
                    <div class="code-block" style="font-size: 9px; max-height: 70px; padding: 6px 6px 6px 6px;">${Object.entries(policy.annotations).slice(0, 3).map(([key, value]) => `${key}: ${value.substring(0, 35)}${value.length > 35 ? '...' : ''}`).join('<br>')}${Object.keys(policy.annotations).length > 3 ? '<br>... +' + (Object.keys(policy.annotations).length - 3) + ' more' : ''}</div>
                </div>
                ` : ''}
            </div>
        </div>
    `;
}

// Switch tabs
function switchTab(index, hubName) {
    for (let i = 0; i < 4; i++) {
        const content = document.getElementById(`tab-${i}`);
        const tab = document.querySelectorAll('.tab')[i];
        if (content) content.classList.remove('active');
        if (tab) tab.classList.remove('active');
    }
    
    const selectedContent = document.getElementById(`tab-${index}`);
    const selectedTab = document.querySelectorAll('.tab')[index];
    if (selectedContent) selectedContent.classList.add('active');
    if (selectedTab) selectedTab.classList.add('active');
}

// Show error
        function showError(message) {
            document.getElementById('app').innerHTML = `
                <div class="error">
                    <h3 style="margin-bottom: 12px;">⚠️ Error</h3>
                    <p>${message}</p>
                    <div style="margin-top: 20px; padding: 20px; background: white; border-radius: 8px;">
                        <h4 style="color: #0066cc; margin-bottom: 12px;">✅ Backend API is Running!</h4>
                        <p style="margin-bottom: 12px;">The frontend is deployed but needs API proxy configuration. You can access the API directly:</p>
                        <div style="background: #f5f5f5; padding: 15px; border-radius: 4px; font-family: monospace; font-size: 13px; margin: 10px 0;">
                            <div>Backend is accessible at: <strong>http://192.168.58.16:8080/api</strong></div>
                            <div style="margin-top: 10px;">Service endpoint: <strong>rhacm-monitor-backend.rhacm-monitor.svc:8080</strong></div>
                        </div>
                        <h5 style="margin-top: 20px; color: #151515;">Test the API:</h5>
                        <pre style="background: #151515; color: #00ff00; padding: 15px; border-radius: 4px; overflow-x: auto;">curl http://192.168.58.16:8080/api/hubs | jq .</pre>
                        <h5 style="margin-top: 20px; color: #151515;">Data Available:</h5>
                        <ul style="margin-top: 10px; line-height: 1.8;">
                            <li>✅ 2 Managed Hubs (acm1, acm2)</li>
                            <li>✅ 1 Spoke Cluster (sno146 SNO)</li>
                            <li>✅ 46 Policies (100% compliant)</li>
                            <li>✅ 4 BareMetalHost Nodes</li>
                            <li>✅ Complete Hardware: CPU, RAM, Storage, BMC, Network</li>
                        </ul>
                    </div>
                    <button class="btn btn-secondary" onclick="testDirectAPI()" style="margin-top: 16px;">
                        📊 Show Sample Data
                    </button>
                </div>
            `;
        }
        
        // Show sample data from API
        async function testDirectAPI() {
            const app = document.getElementById('app');
            app.innerHTML = '<div class="loading"><div class="spinner"></div><p>Fetching sample data...</p></div>';
            
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
        
        <h2 class="section-title">Add New Hub</h2>
        
        <div class="card" style="max-width: 900px; margin: 0 auto;">
            <!-- Method Selection Tabs -->
            <div style="display: flex; border-bottom: 2px solid #f0f0f0; margin-bottom: 20px;">
                <button type="button" class="tab active" id="tab-kubeconfig" onclick="switchAddHubMethod('kubeconfig')" 
                        style="flex: 1; padding: 15px; border: none; background: none; cursor: pointer; font-weight: 600; border-bottom: 3px solid #0066cc;">
                    📄 Kubeconfig File
                </button>
                <button type="button" class="tab" id="tab-credentials" onclick="switchAddHubMethod('credentials')" 
                        style="flex: 1; padding: 15px; border: none; background: none; cursor: pointer; font-weight: 600; border-bottom: 3px solid transparent;">
                    🔑 API Credentials
                </button>
            </div>
            
            <form onsubmit="submitAddHub(event)" style="padding: 20px;">
                <div style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 600;">Hub Name</label>
                    <input type="text" id="hub-name" placeholder="e.g., acm3, regional-hub-1" 
                           required
                           style="width: 100%; padding: 10px; border: 1px solid #d2d2d2; border-radius: 4px; font-size: 14px;">
                    <small style="color: #6a6e73;">Lowercase alphanumeric with hyphens, will be used as namespace</small>
                </div>
                
                <!-- Kubeconfig Method -->
                <div id="method-kubeconfig">
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 600;">
                            Kubeconfig 
                            <span style="font-size: 12px; color: #6a6e73; font-weight: normal;">(YAML or JSON format)</span>
                        </label>
                        <textarea id="hub-kubeconfig" placeholder="Paste kubeconfig content here (YAML or JSON)..." 
                                  rows="12"
                                  style="width: 100%; padding: 10px; border: 1px solid #d2d2d2; border-radius: 4px; font-family: monospace; font-size: 13px;"></textarea>
                        <small style="color: #6a6e73;">
                            📝 Supports both YAML and JSON formats
                        </small>
                    </div>
                </div>
                
                <!-- API Credentials Method -->
                <div id="method-credentials" style="display: none;">
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 600;">API Server Endpoint</label>
                        <input type="text" id="hub-api-endpoint" placeholder="https://api.cluster.example.com:6443" 
                               style="width: 100%; padding: 10px; border: 1px solid #d2d2d2; border-radius: 4px; font-size: 14px;">
                        <small style="color: #6a6e73;">Full API server URL including port</small>
                    </div>
                    
                    <div class="info-box" style="margin-bottom: 15px;">
                        <strong>Choose authentication method:</strong>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
                        <div>
                            <label style="display: block; margin-bottom: 8px; font-weight: 600;">Username</label>
                            <input type="text" id="hub-username" placeholder="admin" 
                                   style="width: 100%; padding: 10px; border: 1px solid #d2d2d2; border-radius: 4px; font-size: 14px;">
                        </div>
                        <div>
                            <label style="display: block; margin-bottom: 8px; font-weight: 600;">Password</label>
                            <input type="password" id="hub-password" placeholder="••••••••" 
                                   style="width: 100%; padding: 10px; border: 1px solid #d2d2d2; border-radius: 4px; font-size: 14px;">
                        </div>
                    </div>
                    
                    <div style="text-align: center; margin: 15px 0; color: #6a6e73; font-weight: 600;">- OR -</div>
                    
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 600;">Bearer Token</label>
                        <textarea id="hub-token" placeholder="Paste service account token here..." 
                                  rows="4"
                                  style="width: 100%; padding: 10px; border: 1px solid #d2d2d2; border-radius: 4px; font-family: monospace; font-size: 12px;"></textarea>
                        <small style="color: #6a6e73;">Use either username/password OR token (not both)</small>
                    </div>
                </div>
                
                <div style="display: flex; gap: 12px; justify-content: flex-end;">
                    <button type="button" class="btn btn-secondary" onclick="fetchHubs()" style="padding: 10px 24px;">
                        Cancel
                    </button>
                    <button type="submit" class="btn btn-primary" style="padding: 10px 24px;">
                        ➕ Add Hub
                    </button>
                </div>
            </form>
        </div>
    `;
}

// Switch add hub method
function switchAddHubMethod(method) {
    // Update tab styles
    document.getElementById('tab-kubeconfig').style.borderBottom = method === 'kubeconfig' ? '3px solid #0066cc' : '3px solid transparent';
    document.getElementById('tab-credentials').style.borderBottom = method === 'credentials' ? '3px solid #0066cc' : '3px solid transparent';
    
    // Show/hide method sections
    document.getElementById('method-kubeconfig').style.display = method === 'kubeconfig' ? 'block' : 'none';
    document.getElementById('method-credentials').style.display = method === 'credentials' ? 'block' : 'none';
}

// Submit add hub form
async function submitAddHub(event) {
    event.preventDefault();
    
    const hubName = document.getElementById('hub-name').value.trim();
    
    // Validate hub name format
    if (!/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(hubName)) {
        alert('Invalid hub name. Must be lowercase alphanumeric with hyphens.');
        return;
    }
    
    // Check which method is active
    const kubeconfigMethod = document.getElementById('method-kubeconfig').style.display !== 'none';
    
    let requestBody = { hubName: hubName };
    
    if (kubeconfigMethod) {
        // Kubeconfig method
        const kubeconfigRaw = document.getElementById('hub-kubeconfig').value.trim();
        if (!kubeconfigRaw) {
            alert('Please provide kubeconfig content');
            return;
        }
        // Base64 encode the kubeconfig to avoid JSON escaping issues
        requestBody.kubeconfig = btoa(kubeconfigRaw);
    } else {
        // API credentials method
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
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert(
                `✅ Hub added successfully!\n\n` +
                `Hub Name: ${data.data.hubName}\n` +
                `Namespace: ${data.data.namespace}\n` +
                `Secret: ${data.data.secretName}\n\n` +
                `The hub will appear in the list after refresh.`
            );
            // Clear client-side cache and reload hubs list
            delete window.cachedHubsData;
            fetchHubs();
        } else {
            alert('❌ Failed to add hub: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        alert('❌ Error adding hub: ' + error.message);
    }
}

// Quick return to homepage using cached data
function returnToHomepage() {
    if (window.cachedHubsData) {
        // Use cached data for instant display
        currentView = 'hubs';
        renderHubsList(window.cachedHubsData);
    } else {
        // No cached data, fetch fresh
        fetchHubs();
    }
}

// Refresh single hub (clears cache for that hub and reloads its card)
async function refreshHub(hubName) {
    // Find the hub card element
    const cards = document.querySelectorAll('.card');
    let hubCard = null;
    
    for (const card of cards) {
        const heading = card.querySelector('h3 span');
        if (heading && heading.textContent === hubName) {
            hubCard = card;
            break;
        }
    }
    
    if (!hubCard) return;
    
    // Show loading state in the card
    const originalContent = hubCard.innerHTML;
    hubCard.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-secondary);">🔄 Refreshing...</div>';
    
    try {
        // Clear cache for this specific hub
        await fetch(`${API_BASE}/hubs/${hubName}/refresh`, { method: 'POST' });
        
        // Fetch fresh data for this hub
        const response = await fetch(`${API_BASE}/hubs/${hubName}`);
        const data = await response.json();
        
        if (data.success && data.data) {
            // Re-render just this hub card
            renderHubCard(data.data, hubCard);
        } else {
            throw new Error(data.error || 'Failed to fetch hub');
        }
    } catch (error) {
        console.error('Error refreshing hub:', error);
        // Restore original content on error
        hubCard.innerHTML = originalContent;
        alert('Failed to refresh hub: ' + error.message);
    }
}

// Render a single hub card
function renderHubCard(hub, cardElement) {
    const statusClass = (hub.status.toLowerCase().includes('ready') || hub.status.toLowerCase().includes('connected')) ? 'ready' : (hub.status.toLowerCase() === 'unknown' ? 'unknown' : 'notready');
    const spokeCount = hub.managedClusters?.length || 0;
    const policyCount = hub.policiesInfo?.length || 0;
    
    const uniqueHostnames = new Set();
    (hub.nodesInfo || []).forEach(node => {
        uniqueHostnames.add(node.name.split('.')[0]);
    });
    const nodeCount = uniqueHostnames.size;
    
    let html = `
        <h3>
            <span>${hub.name}</span>
            <span class="status ${statusClass}">${hub.status}</span>
        </h3>
        <div class="info-row">
            <span class="label">OpenShift Version:</span>
            <span class="value">${hub.clusterInfo.openshiftVersion || 'N/A'}</span>
        </div>
        <div class="info-row">
            <span class="label">Kubernetes:</span>
            <span class="value">${hub.version || 'N/A'}</span>
        </div>
        ${hub.clusterInfo.region ? '<div class="info-row"><span class="label">Configuration:</span><span class="value"><code class="config-badge">' + hub.clusterInfo.region + '</code></span></div>' : ''}
        <div class="info-row">
            <span class="label">Nodes:</span>
            <span class="value"><span class="badge">${nodeCount}</span></span>
        </div>
        ${policyCount > 0 ? '<div class="info-row"><span class="label">Policies:</span><span class="value"><span class="badge success">' + policyCount + '</span></span></div>' : ''}
        <div class="info-row">
            <span class="label">Spoke Clusters:</span>
            <span class="value"><span class="badge">${spokeCount}</span></span>
        </div>
    `;
    
    if (hub.clusterInfo.consoleURL || hub.clusterInfo.gitopsURL) {
        html += '<div class="info-row" style="display: flex; gap: 10px; justify-content: space-between;">';
        html += hub.clusterInfo.consoleURL ? '<a href="' + hub.clusterInfo.consoleURL + '" target="_blank" class="console-link">🖥️ Console</a>' : '<span></span>';
        html += hub.clusterInfo.gitopsURL ? '<a href="' + hub.clusterInfo.gitopsURL + '" target="_blank" class="console-link">🔄 GitOps</a>' : '<span></span>';
        html += '</div>';
    }
    
    html += `
        <div style="display: flex; gap: 8px; margin-top: 12px;">
            <button class="btn btn-secondary" onclick="refreshHub('${hub.name}')" style="flex: 0 0 auto; padding: 10px 16px;" title="Refresh this hub">
                🔄
            </button>
            <button class="btn btn-primary" onclick="showHubDetails('${hub.name}')" style="flex: 1;">
                View Details
            </button>
        </div>
    `;
    
    cardElement.innerHTML = html;
}

// Render just the hub sections (for refresh)
function renderHubSections(hubs) {
    const managedHubs = hubs.filter(h => h.annotations?.source !== 'manual');
    const unmanagedHubs = hubs.filter(h => h.annotations?.source === 'manual');
    
    // Render managed hubs section
    const managedSection = document.querySelector('.managed-hubs-section');
    if (managedSection) {
        if (managedHubs.length > 0) {
            let html = '<div class="grid">';
            managedHubs.forEach(hub => {
                const statusClass = hub.status.toLowerCase().includes('ready') || hub.status.toLowerCase().includes('connected') ? 'ready' : 'notready';
                const spokeCount = hub.managedClusters?.length || 0;
                const policyCount = hub.policiesInfo?.length || 0;
                
                const uniqueHostnames = new Set();
                (hub.nodesInfo || []).forEach(node => {
                    uniqueHostnames.add(node.name.split('.')[0]);
                });
                const nodeCount = uniqueHostnames.size;
                
                html += `
                    <div class="card">
                        <h3>
                            <span>${hub.name}</span>
                            <span class="status ${statusClass}">${hub.status}</span>
                        </h3>
                        <div class="info-row">
                            <span class="label">OpenShift Version:</span>
                            <span class="value">${hub.clusterInfo.openshiftVersion || 'N/A'}</span>
                        </div>
                        <div class="info-row">
                            <span class="label">Kubernetes:</span>
                            <span class="value">${hub.version || 'N/A'}</span>
                        </div>
                        ${hub.clusterInfo.region ? `
                        <div class="info-row">
                            <span class="label">Configuration:</span>
                            <span class="value"><code class="config-badge">${hub.clusterInfo.region}</code></span>
                        </div>
                        ` : ''}
                        <div class="info-row">
                            <span class="label">Nodes:</span>
                            <span class="value"><span class="badge">${nodeCount}</span></span>
                        </div>
                        ${policyCount > 0 ? `
                        <div class="info-row">
                            <span class="label">Policies:</span>
                            <span class="value"><span class="badge success">${policyCount}</span></span>
                        </div>
                        ` : ''}
                        <div class="info-row">
                            <span class="label">Spoke Clusters:</span>
                            <span class="value"><span class="badge">${spokeCount}</span></span>
                        </div>
                        ${hub.clusterInfo.consoleURL || hub.clusterInfo.gitopsURL ? '<div class="info-row" style="display: flex; gap: 10px; justify-content: space-between;">' + (hub.clusterInfo.consoleURL ? '<a href="' + hub.clusterInfo.consoleURL + '" target="_blank" class="console-link">🖥️ Console</a>' : '<span></span>') + (hub.clusterInfo.gitopsURL ? '<a href="' + hub.clusterInfo.gitopsURL + '" target="_blank" class="console-link">🔄 GitOps</a>' : '<span></span>') + '</div>' : ''}
                        <button class="btn btn-primary" onclick="showHubDetails('${hub.name}')" style="width: 100%; margin-top: 12px;">
                            View Details
                        </button>
                    </div>
                `;
            });
            html += '</div>';
            managedSection.innerHTML = html;
        }
    }
    
    // Render unmanaged hubs section
    const unmanagedSection = document.querySelector('.unmanaged-hubs-section');
    if (unmanagedSection) {
        if (unmanagedHubs.length > 0) {
            let html = '<div class="grid">';
            unmanagedHubs.forEach(hub => {
                const statusClass = hub.status.toLowerCase() === 'ready' || hub.status.toLowerCase() === 'connected' ? 'ready' : 'notready';
                const spokeCount = hub.managedClusters?.length || 0;
                const policyCount = hub.policiesInfo?.length || 0;
                
                const uniqueHostnames = new Set();
                (hub.nodesInfo || []).forEach(node => {
                    uniqueHostnames.add(node.name.split('.')[0]);
                });
                const nodeCount = uniqueHostnames.size;
                
                html += `
                    <div class="card">
                        <h3>
                            <span>${hub.name}</span>
                            <span class="status ${statusClass}">${hub.status}</span>
                        </h3>
                        <div class="info-row">
                            <span class="label">OpenShift Version:</span>
                            <span class="value">${hub.clusterInfo.openshiftVersion || 'N/A'}</span>
                        </div>
                        <div class="info-row">
                            <span class="label">Kubernetes:</span>
                            <span class="value">${hub.version || 'Unknown'}</span>
                        </div>
                        <div class="info-row">
                            <span class="label">Nodes:</span>
                            <span class="value"><span class="badge">${nodeCount}</span></span>
                        </div>
                        <div class="info-row">
                            <span class="label">Spoke Clusters:</span>
                            <span class="value"><span class="badge">${spokeCount}</span></span>
                        </div>
                        ${hub.clusterInfo.consoleURL || hub.clusterInfo.gitopsURL ? '<div class="info-row" style="display: flex; gap: 10px; justify-content: space-between;">' + (hub.clusterInfo.consoleURL ? '<a href="' + hub.clusterInfo.consoleURL + '" target="_blank" class="console-link">🖥️ Console</a>' : '<span></span>') + (hub.clusterInfo.gitopsURL ? '<a href="' + hub.clusterInfo.gitopsURL + '" target="_blank" class="console-link">🔄 GitOps</a>' : '<span></span>') + '</div>' : ''}
                        <button class="btn btn-primary" onclick="showHubDetails('${hub.name}')" style="width: 100%; margin-top: 12px;">
                            View Details
                        </button>
                    </div>
                `;
            });
            html += '</div>';
            unmanagedSection.innerHTML = html;
        } else {
            unmanagedSection.innerHTML = `
                <div class="card" style="padding: 40px; text-align: center; background: var(--bg-tertiary);">
                    <div style="font-size: 48px; margin-bottom: 15px; opacity: 0.5;">📦</div>
                    <h3 style="color: var(--text-secondary); margin-bottom: 10px;">No Unmanaged Hubs</h3>
                    <p style="color: var(--text-secondary); margin-bottom: 20px;">
                        ${managedHubs.length === 0 ? 'No hubs discovered automatically.' : 'Add external hub clusters by providing their kubeconfig.'}<br>
                        ${managedHubs.length === 0 ? 'Add your first hub to start monitoring.' : 'These hubs will be monitored without being managed by this Global Hub.'}
                    </p>
                    <button class="btn btn-primary" onclick="showAddHubForm()" style="padding: 12px 24px;">
                        ➕ Add Your First Hub
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
        return '<div class="empty-state"><div class="empty-state-icon">🔧</div><p>No operators found</p></div>';
    }
    
    // Group operators by display name
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
        <div class="card" style="margin-bottom: 20px; padding: 20px;">
            <div style="display: flex; gap: 15px; align-items: center; justify-content: space-between;">
                <div style="color: var(--text-secondary); font-size: 14px;">
                    ${uniqueOperators.length} unique operator${uniqueOperators.length !== 1 ? 's' : ''} (${operators.length} total installations)
                </div>
                <div style="display: flex; gap: 15px; align-items: center;">
                    <div>
                        <input type="text" id="search-operator-name" placeholder="🔍 Search operator..." 
                               style="padding: 8px 12px; border: 1px solid var(--border-color); border-radius: 4px; font-size: 13px; background: var(--bg-secondary); color: var(--text-primary);"
                               onkeyup="filterOperators()">
                    </div>
                    <button class="btn btn-secondary" onclick="clearOperatorSearch()" style="padding: 8px 16px;">
                        ✕ Clear
                    </button>
                </div>
            </div>
            <div id="operator-count" style="margin-top: 10px; color: var(--text-secondary); font-size: 13px;">
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
                    ${operator.displayName !== operator.name ? `<br><small style="color: var(--text-secondary); font-size: 11px;">${operator.name}</small>` : ''}
                </td>
                <td><code class="config-badge">${operator.version || 'N/A'}</code></td>
                <td>
                    ${namespaceCount === 1 ? operator.namespaces[0] : `<span class="badge">${namespaceCount} ns</span>`}
                    ${namespaceCount > 1 ? `<br><small style="color: var(--text-secondary); font-size: 10px;">${operator.namespaces.slice(0, 3).join(', ')}${namespaceCount > 3 ? `, +${namespaceCount - 3} more` : ''}</small>` : ''}
                </td>
                <td><span class="status ${phaseClass}">${operator.phase || 'Unknown'}</span></td>
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

// Clear operator search
function clearOperatorSearch() {
    const searchInput = document.getElementById('search-operator-name');
    if (searchInput) {
        searchInput.value = '';
        filterOperators();
    }
}

