// Fetch and display alerts
function fetchAlerts() {
  fetch('http://localhost:3000/api/alerts')
    .then(response => response.json())
    .then(alerts => {
      document.getElementById('alerts-list').innerHTML = alerts.map(a => `
        <li class="bg-red-900 p-2 rounded-md text-sm flex items-center">
          <i class="fas fa-exclamation-circle mr-2 text-red-400"></i>
          ${a.type}: ${a.message} <span class="text-gray-400 ml-2">(${new Date(a.date).toLocaleString()})</span>
        </li>
      `).join('');
    })
    .catch(err => console.error('Alerts Error:', err));
}
fetchAlerts();
setInterval(fetchAlerts, 60000);

// Drug Search
document.getElementById('search-btn').addEventListener('click', () => {
  const query = document.getElementById('drug-search').value.trim();
  if (!query) return;
  fetch(`http://localhost:3000/api/drugs/search?query=${query}`)
    .then(response => response.json())
    .then(drugs => {
      const table = document.getElementById('search-results');
      table.classList.remove('hidden');
      table.querySelector('tbody').innerHTML = drugs.map(d => `
        <tr class="border-b border-gray-600 hover:bg-gray-700">
          <td class="py-2 px-4">${d.name}</td>
          <td class="py-2 px-4">$${d.cost.toLocaleString()}</td>
          <td class="py-2 px-4">${d.genericAvailable ? '<i class="fas fa-check text-green-400"></i>' : '<i class="fas fa-times text-red-400"></i>'}</td>
          <td class="py-2 px-4">${d.genericName}</td>
          <td class="py-2 px-4">${d.pbmOptions.map(o => `${o.pbm}: $${o.cost.toLocaleString()}`).join(', ')}</td>
          <td class="py-2 px-4">US: ${d.approvals?.us || 'N/A'}, EU: ${d.approvals?.eu || 'N/A'}</td>
          <td class="py-2 px-4"><button class="track-drug px-2 py-1 bg-green-600 rounded-md hover:bg-green-700 transition flex items-center" data-name="${d.name}"><i class="fas fa-plus mr-1"></i> Track</button></td>
        </tr>
      `).join('');

      document.querySelectorAll('.track-drug').forEach(btn => {
        btn.addEventListener('click', () => {
          fetch('http://localhost:3000/api/drugs/track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: btn.dataset.name }),
          }).then(() => fetchTrackedDrugs());
        });
      });
    })
    .catch(err => console.error('Search Error:', err));
});

// Fetch and display tracked drugs
function fetchTrackedDrugs() {
  fetch('http://localhost:3000/api/drugs/tracked')
    .then(response => response.json())
    .then(drugs => {
      document.getElementById('tracked-drugs-table').innerHTML = drugs.map(d => `
        <tr class="border-b border-gray-600 hover:bg-gray-700">
          <td class="py-2 px-4">${d.name}</td>
          <td class="py-2 px-4">$${d.cost.toLocaleString()}</td>
          <td class="py-2 px-4">${d.pbmOptions.map(o => `${o.pbm}: $${o.cost.toLocaleString()}`).join(', ')}</td>
          <td class="py-2 px-4">${new Date(d.trackedSince).toLocaleString()}</td>
        </tr>
      `).join('');
    })
    .catch(err => console.error('Tracked Drugs Error:', err));
}
fetchTrackedDrugs();

// Fetch and display competitors
function fetchCompetitors() {
  fetch('http://localhost:3000/api/competitors')
    .then(response => response.json())
    .then(competitors => {
      document.getElementById('tracked-insurers-table').innerHTML = competitors.filter(c => c.isTracked).map(c => `
        <tr class="border-b border-gray-600 hover:bg-gray-700">
          <td class="py-2 px-4">${c.name}</td>
          <td class="py-2 px-4">${c.marketShare}%</td>
          <td class="py-2 px-4">${c.filing}</td>
          <td class="py-2 px-4">${c.pbmPartners.join(', ')}</td>
          <td class="py-2 px-4">${c.patents.map(p => `${p.number} (Exp: ${p.expiry}, Product: ${p.linkedProduct})`).join(', ')}</td>
          <td class="py-2 px-4">${c.pmas.map(p => `${p.id}: ${p.status}`).join(', ')}</td>
          <td class="py-2 px-4">${new Date(c.lastUpdated).toLocaleString()}</td>
        </tr>
      `).join('');

      document.getElementById('competitor-table').innerHTML = competitors.map(c => `
        <tr class="border-b border-gray-600 hover:bg-gray-700">
          <td class="py-2 px-4">${c.name}</td>
          <td class="py-2 px-4">${c.marketShare}%</td>
          <td class="py-2 px-4">${c.filing}</td>
          <td class="py-2 px-4">${c.pbmPartners.join(', ')}</td>
          <td class="py-2 px-4">${c.isTracked ? '<span class="text-green-400 flex items-center"><i class="fas fa-check mr-1"></i> Tracked</span>' : `<button class="track-insurer px-2 py-1 bg-blue-600 rounded-md hover:bg-blue-700 transition flex items-center" data-name="${c.name}"><i class="fas fa-plus mr-1"></i> Track</button>`}</td>
        </tr>
      `).join('');

      document.querySelectorAll('.track-insurer').forEach(btn => {
        btn.addEventListener('click', () => {
          fetch('http://localhost:3000/api/competitors/track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: btn.dataset.name }),
          }).then(() => fetchCompetitors());
        });
      });

      const ctx = document.getElementById('market-chart').getContext('2d');
      new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: competitors.map(c => c.name),
          datasets: [{
            data: competitors.map(c => c.marketShare),
            backgroundColor: ['#4CAF50', '#2196F3', '#FF9800'],
            borderWidth: 2,
            borderColor: '#fff'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'top', labels: { color: '#fff' } } }
        }
      });
    })
    .catch(err => console.error('Competitors Error:', err));
}
fetchCompetitors();

// Fetch and display RFPs
fetch('http://localhost:3000/api/rfps')
  .then(response => response.json())
  .then(rfps => {
    document.getElementById('rfp-table').innerHTML = rfps.map(r => `
      <tr class="border-b border-gray-600 hover:bg-gray-700">
        <td class="py-2 px-4">${r.title}</td>
        <td class="py-2 px-4">${r.issuer}</td>
        <td class="py-2 px-4">$${r.budget.toLocaleString()}</td>
        <td class="py-2 px-4">${r.winner}</td>
        <td class="py-2 px-4">${r.recommendation}</td>
        <td class="py-2 px-4">${new Date(r.lastUpdated).toLocaleString()}</td>
      </tr>
    `).join('');
  })
  .catch(err => console.error('RFPs Error:', err));

// Fetch and display trends
fetch('http://localhost:3000/api/trends')
  .then(response => response.json())
  .then(trends => {
    document.getElementById('trend-table').innerHTML = trends.map(t => `
      <tr class="border-b border-gray-600 hover:bg-gray-700">
        <td class="py-2 px-4">${t.category}</td>
        <td class="py-2 px-4">${t.description}</td>
        <td class="py-2 px-4">${t.source}</td>
        <td class="py-2 px-4">${t.date}</td>
        <td class="py-2 px-4">${new Date(t.lastUpdated).toLocaleString()}</td>
      </tr>
    `).join('');
  })
  .catch(err => console.error('Trends Error:', err));