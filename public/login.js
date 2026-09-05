const phoneForm = document.querySelector('#phone-form');
const codeForm = document.querySelector('#code-form');
const phoneInput = document.querySelector('#phone');
const feedback = document.querySelector('#feedback');
let phone;
const signup = document.createElement('a');
signup.href = '/passenger-register.html';
signup.textContent = 'Ainda não tenho conta · Criar cadastro';
signup.style.cssText = 'display:block;margin-top:22px;text-align:center;color:#718079;font-size:12px;text-decoration:none';
document.querySelector('.login-box').append(signup);
const phoneFromUrl = new URLSearchParams(window.location.search).get('phone');
if (phoneFromUrl) phoneInput.value = phoneFromUrl;

phoneForm.addEventListener('submit', async event => {
  event.preventDefault();
  phone = phoneInput.value;
  feedback.textContent = 'Enviando código por SMS/WhatsApp...';
  const response = await fetch('/v1/auth/request-code', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ phone }) });
  const data = await response.json();
  if (!response.ok) { feedback.textContent = data.error; return; }
  phoneForm.classList.add('hidden');
  codeForm.classList.remove('hidden');
  feedback.className = 'login-feedback success';
  feedback.textContent = data.demo_code ? `Modo demonstração: use o código ${data.demo_code}` : 'Código enviado. Verifique seu celular.';
  document.querySelector('#code').focus();
});

codeForm.addEventListener('submit', async event => {
  event.preventDefault();
  const response = await fetch('/v1/auth/verify-code', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ phone, code: document.querySelector('#code').value }) });
  const data = await response.json();
  if (!response.ok) { feedback.className = 'login-feedback'; feedback.textContent = data.error; return; }
  sessionStorage.setItem('passenger_token', data.access_token);
  window.location.href = '/';
});

document.querySelector('#back').addEventListener('click', () => { codeForm.classList.add('hidden'); phoneForm.classList.remove('hidden'); feedback.textContent = ''; });
