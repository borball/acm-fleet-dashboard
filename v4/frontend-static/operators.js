// Render operators list
function renderOperators(operators) {
    if (operators.length === 0) {
        return '<div class="empty-state"><div class="empty-state-icon">🔧</div><p>No operators found</p></div>';
    }
    
    let html = `
        <div class="card" style="margin-bottom: 20px; padding: 20px;">
            <div style="display: flex; gap: 15px; align-items: center;">
                <div style="flex: 1;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600; color: var(--text-secondary);">🔍 Search Operator</label>
                    <input type="text" id="search-operator-name" placeholder="Enter operator name..." 
                           style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 4px; font-size: 14px; background: var(--bg-secondary); color: var(--text-primary);"
                           onkeyup="filterOperators()">
                </div>
                <div style="padding-top: 28px;">
                    <button class="btn btn-secondary" onclick="clearOperatorSearch()" style="padding: 10px 20px;">
                        ✕ Clear
                    </button>
                </div>
            </div>
            <div id="operator-count" style="margin-top: 15px; color: var(--text-secondary); font-size: 14px;">
                Showing ${operators.length} operator${operators.length !== 1 ? 's' : ''}
            </div>
        </div>
        
        <div class="card">
            <table id="operators-table">
                <thead>
                    <tr>
                        <th>Operator Name</th>
                        <th>Version</th>
                        <th>Namespace</th>
                        <th>Status</th>
                        <th>Provider</th>
                        <th>Created</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    operators.forEach((operator) => {
        const phaseClass = operator.phase === 'Succeeded' ? 'ready' : 'notready';
        
        html += `
            <tr class="operator-row" data-operator-name="${(operator.displayName || operator.name).toLowerCase()}">
                <td>
                    <strong>${operator.displayName || operator.name}</strong>
                    ${operator.displayName && operator.name !== operator.displayName ? `<br><small style="color: var(--text-secondary); font-size: 11px;">${operator.name}</small>` : ''}
                </td>
                <td><code class="config-badge">${operator.version || 'N/A'}</code></td>
                <td>${operator.namespace}</td>
                <td><span class="status ${phaseClass}">${operator.phase || 'Unknown'}</span></td>
                <td>${operator.provider || 'N/A'}</td>
                <td style="font-size: 12px;">${new Date(operator.createdAt).toLocaleDateString()}</td>
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


