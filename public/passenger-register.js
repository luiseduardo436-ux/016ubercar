const form = document.querySelector('#passenger-register');
const feedback = document.querySelector('#feedback');
form.addEventListener('submit', async event => {
  event.preventDefault();
  const button = form.querySelector('button');
  button.disabled = true;
  feedback.textContent = 'Criando sua conta...';
  try {
    const response = await fetch('/v1/passengers/register', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    feedback.className = 'login-feedback success';
    feedback.textContent = 'Conta criada. Enviando código de acesso...';
    setTimeout(() => { window.location.href = `/login.html?phone=${encodeURIComponent(data.phone)}`; }, 700);
  } catch (error) { feedback.textContent = error.message || 'Não foi possível criar a conta'; button.disabled = false; }
});
