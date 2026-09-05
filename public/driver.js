const mode = document.querySelector('#mode');
const toggle = document.querySelector('#toggle');
const action = document.querySelector('#action');
const rideTitle = document.querySelector('#ride-title');
const rideDetail = document.querySelector('#ride-detail');
const operationsPolish = document.createElement('link');
operationsPolish.rel = 'stylesheet';
operationsPolish.href = '/operations-polish.css';
document.head.append(operationsPolish);
let online = true;
const registerLink = document.createElement('a');
registerLink.href = '/driver-register.html';
registerLink.innerHTML = 'Quero me cadastrar <span>→</span>';
document.querySelector('.quick-links')?.prepend(registerLink);

if (navigator.geolocation) navigator.geolocation.watchPosition(position => {
  fetch('/v1/driver/location', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ lat: position.coords.latitude, lng: position.coords.longitude, accuracy_m: position.coords.accuracy, speed_kmh: position.coords.speed == null ? null : position.coords.speed * 3.6, heading: position.coords.heading }) }).catch(() => {});
}, () => {}, { enableHighAccuracy: true, maximumAge: 5000 });

async function refresh() {
  const response = await fetch('/v1/driver/dashboard');
  const data = await response.json();
  const ride = data.active_rides[0];
  if (!ride) { rideTitle.textContent = data.online ? 'Nenhuma corrida no momento' : 'Você está offline'; rideDetail.textContent = data.online ? 'Fique atento para receber novas chamadas.' : 'Ative sua disponibilidade para começar.'; action.textContent = 'Atualizar painel'; return; }
  rideTitle.textContent = ride.status === 'searching' ? 'Nova solicitação · Centro → RibeirãoShopping' : `Corrida ${ride.status}`;
  rideDetail.textContent = `Estimativa R$ ${ride.estimate.amount.toFixed(2).replace('.', ',')} · ${ride.estimate.distance_km} km · taxa fixa R$ 1,00 após concluir`;
  action.textContent = ride.status === 'searching' ? 'Aceitar corrida →' : ride.status === 'accepted' ? 'Iniciar corrida →' : 'Finalizar corrida →';
  action.onclick = async () => { const next = ride.status === 'searching' ? 'accept' : ride.status === 'accepted' ? 'start' : 'finish'; await fetch(`/v1/driver/requests/${ride.request_id}/${next}`, { method: 'POST' }); refresh(); };
}

toggle.onclick = async () => { online = !online; await fetch('/v1/driver/status', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ online }) }); toggle.classList.toggle('on', online); mode.textContent = online ? 'Online' : 'Offline'; refresh(); };
action.onclick = refresh;
refresh();
