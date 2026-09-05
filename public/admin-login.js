const form = document.querySelector('#login');
const error = document.querySelector('#error');
form.addEventListener('submit', async event => {
  event.preventDefault();
  error.textContent = 'Entrando...';
  const response = await fetch('/v1/auth/admin', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ email: document.querySelector('#email').value, password: document.querySelector('#password').value }) });
  const data = await response.json();
  if (!response.ok) { error.textContent = data.error; return; }
  sessionStorage.setItem('admin_token', data.access_token);
  window.location.href = '/admin.html';
});
