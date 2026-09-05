const polish = document.createElement('link');
polish.rel = 'stylesheet';
polish.href = '/register-polish.css';
document.head.append(polish);
const form = document.querySelector('#register');
const feedback = document.querySelector('#feedback');
form.addEventListener('submit', async event => {
  event.preventDefault();
  const formData = new FormData(form);
  const response = await fetch('/v1/driver/register', { method: 'POST', body: formData });
  const data = await response.json();
  if (!response.ok) { feedback.textContent = data.error; return; }
  form.reset();
  feedback.className = 'register-feedback success';
  feedback.textContent = `Cadastro ${data.id} enviado. Status: aguardando análise.`;
});
