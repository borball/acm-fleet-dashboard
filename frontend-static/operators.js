// Render operators list
function renderOperators(operators) {
    if (operators.length === 0) {
        return '<div class="empty-state"><div class="empty-state__icon">🔧</div><p>No operators found</p></div>';
    }

    let html = `
        <div class="card filter-bar">
            <div class="filter-bar__row">
                <div class="filter-bar__group">
                    <label class="filter-bar__label">Search Operator</label>
                    <input type="text" id="search-operator-name" placeholder="Enter operator name..."
                           class="filter-bar__input"
                           onkeyup="filterOperators()">
                </div>
                <div class="filter-bar__actions">
                    <button class="btn btn--secondary" onclick="clearOperatorSearch()">
                        Clear
                    </button>
                </div>
            </div>
            <div id="operator-count" class="filter-bar__count">
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
                    ${operator.displayName && operator.name !== operator.displayName ? `<br><small class="data-table__cell--muted">${operator.name}</small>` : ''}
                </td>
                <td><code class="config-badge">${operator.version || 'N/A'}</code></td>
                <td>${operator.namespace}</td>
                <td><span class="status status--${phaseClass}">${operator.phase || 'Unknown'}</span></td>
                <td>${operator.provider || 'N/A'}</td>
                <td class="data-table__cell--date">${new Date(operator.createdAt).toLocaleDateString()}</td>
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
