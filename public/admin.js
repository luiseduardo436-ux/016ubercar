const operationsPolish = document.createElement('link');
operationsPolish.rel = 'stylesheet';
operationsPolish.href = '/operations-polish.css';
document.head.append(operationsPolish);

async function loadSummary() {
  const token = sessionStorage.getItem('admin_token');
  if (!token) { window.location.href = '/admin-login.html'; return; }
  const response = await fetch('/v1/admin/summary', { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 401) { sessionStorage.removeItem('admin_token'); window.location.href = '/admin-login.html'; return; }
  const data = await response.json();
  document.querySelector('#drivers').textContent = data.online_drivers;
  document.querySelector('#active').textContent = data.active_rides;
  document.querySelector('#completed').textContent = data.completed_today;
  document.querySelector('#gross').textContent = `R$ ${data.gross_today.toFixed(2).replace('.', ',')}`;
  let fee = document.querySelector('#platform-fees');
  if (!fee) { fee = document.createElement('div'); fee.className = 'metric-extra'; fee.innerHTML = '<small>Taxas da plataforma</small><strong id="platform-fees"></strong><span>R$ 1,00 por corrida concluída</span>'; document.querySelector('.metrics').append(fee); }
  fee.querySelector('strong').textContent = `R$ ${data.platform_fees_today.toFixed(2).replace('.', ',')}`;
  await loadApplications(token);
}

async function loadApplications(token) {
  const response = await fetch('/v1/admin/driver-applications', { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) return;
  const applications = await response.json();
  let panel = document.querySelector('#applications');
  if (!panel) { panel = document.createElement('section'); panel.id = 'applications'; panel.className = 'application-list'; document.querySelector('.admin-shell').append(panel); }
  panel.innerHTML = `<p class="eyebrow">Cadastros de motoristas</p>${applications.length ? applications.map(application => `<article><div><strong>${application.name}</strong><span>${application.city} · ${application.vehicle} · ${application.plate}</span><small>Status: ${application.status}</small></div>${application.status === 'pending' ? `<div><button data-action="approve" data-id="${application.id}">Aprovar</button><button data-action="reject" data-id="${application.id}">Reprovar</button></div>` : ''}</article>`).join('') : '<p class="empty">Nenhum cadastro pendente.</p>'}`;
  panel.querySelectorAll('button').forEach(button => button.onclick = async () => { await fetch(`/v1/admin/driver-applications/${button.dataset.id}/${button.dataset.action}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }); loadApplications(token); });
}
loadSummary();
setInterval(loadSummary, 5000);
