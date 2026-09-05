const requestButton = document.querySelector('#request');
const homeStyles = document.createElement('link');
homeStyles.rel = 'stylesheet';
homeStyles.href = '/home-sections.css';
document.head.append(homeStyles);
const mobileRideStyles = document.createElement('link');
mobileRideStyles.rel = 'stylesheet';
mobileRideStyles.href = '/mobile-ride.css';
document.head.append(mobileRideStyles);
const estimateBox = document.querySelector('#estimate strong');
const statusBox = document.querySelector('#status');
const cancelButton = document.querySelector('#cancel');
document.querySelectorAll('.ride-option').forEach(option => option.addEventListener('click', () => { document.querySelectorAll('.ride-option').forEach(item => item.classList.remove('active')); option.classList.add('active'); }));
const originInput = document.querySelector('#origin');
const destinationInput = document.querySelector('#destination');
const mapLoading = document.querySelector('#map-loading');
let activeRide;
let map;
let originMarker;
let destinationMarker;
let driverMarker;
let routeLine;
let routeDistanceKm = 5.8;
let selectedRoute;
const fallbackOrigin = [-21.1775, -47.8103];
const fallbackDestination = [-21.1848, -47.8087];

function pin(color) {
  return L.divIcon({ className: 'map-pin', html: `<span style="background:${color}"></span>`, iconSize: [18, 18], iconAnchor: [9, 9] });
}

async function geocode(address, fallback) {
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&q=${encodeURIComponent(address)}`, { headers: { Accept: 'application/json' } });
    const [place] = await response.json();
    return place ? [Number(place.lat), Number(place.lon)] : fallback;
  } catch { return fallback; }
}

async function drawRoute() {
  mapLoading.textContent = 'Localizando endereços...';
  const [origin, destination] = await Promise.all([geocode(originInput.value, fallbackOrigin), geocode(destinationInput.value, fallbackDestination)]);
  originMarker?.remove(); destinationMarker?.remove(); routeLine?.remove();
  originMarker = L.marker(origin, { icon: pin('#18221d') }).addTo(map).bindPopup('Origem').openPopup();
  destinationMarker = L.marker(destination, { icon: pin('#d5f05d') }).addTo(map).bindPopup('Destino');
  mapLoading.textContent = 'Calculando rota...';
  try {
    const response = await fetch(`/v1/maps/route?start_lat=${origin[0]}&start_lng=${origin[1]}&end_lat=${destination[0]}&end_lng=${destination[1]}`);
    const data = await response.json();
    const coordinates = data.geometry?.coordinates?.map(([lng, lat]) => [lat, lng]);
    routeLine = L.polyline(coordinates?.length ? coordinates : [origin, destination], { color: '#9aad27', weight: 5, opacity: .9 }).addTo(map);
    map.fitBounds(routeLine.getBounds(), { padding: [28, 28] });
    selectedRoute = { origin, destination };
    routeDistanceKm = Number(data.distance_km || 5.8);
    mapLoading.textContent = `${routeDistanceKm.toFixed(2).replace('.', ',')} km · ${Math.round(Number(data.duration_seconds || 0) / 60)} min de viagem`;
    estimateBox.textContent = `R$ ${(routeDistanceKm * 6.25).toFixed(2).replace('.', ',')}`;
  } catch { selectedRoute = { origin, destination }; routeLine = L.polyline([origin, destination], { color: '#9aad27', weight: 5 }).addTo(map); map.fitBounds(routeLine.getBounds(), { padding: [28, 28] }); mapLoading.textContent = 'Rota aproximada'; }
  return { origin, destination };
}

async function initializeMap() {
  map = L.map('map', { zoomControl: false }).setView(fallbackOrigin, 13);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
  await drawRoute();
}

function connectRealtime() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${protocol}//${location.host}/v1/realtime`);
  socket.addEventListener('message', event => {
    const data = JSON.parse(event.data);
    if (data.type !== 'driver.location' || (activeRide && data.ride_id && data.ride_id !== activeRide) || !map) return;
    driverMarker?.remove();
    driverMarker = L.marker([data.location.lat, data.location.lng], { icon: pin('#d26a35') }).addTo(map).bindPopup('Motorista em tempo real');
  });
  socket.addEventListener('error', () => socket.close());
}

async function getEstimate() {
  try {
    const response = await fetch('/v1/estimates/price?start_lat=-21.17&start_lng=-47.81&end_lat=-21.18&end_lng=-47.80');
    if (!response.ok) throw new Error('Falha ao consultar tarifa');
    const [estimate] = await response.json();
    estimateBox.textContent = `R$ ${estimate.amount.toFixed(2).replace('.', ',')}`;
  } catch { estimateBox.textContent = 'Indisponível agora'; }
}

function statusText(ride) {
  const finalAmount = ride.price_final ?? ride.estimate?.amount ?? 0;
  const labels = { searching: 'Procurando o melhor motorista...', accepted: 'Motorista encontrado. Preparando chegada...', driver_en_route: `Marcos está a caminho · ${ride.driver.vehicle}`, in_progress: 'Corrida em andamento. Boa viagem!', completed: `Chegamos! Total: R$ ${finalAmount.toFixed(2).replace('.', ',')}`, cancelled: 'Corrida cancelada.' };
  return labels[ride.status] || ride.status;
}

async function refreshRide() {
  if (!activeRide) return;
  const response = await fetch(`/v1/requests/${activeRide}`);
  const ride = await response.json();
  if (!response.ok) return;
  statusBox.innerHTML = `<strong>${statusText(ride)}</strong>${ride.status === 'driver_en_route' ? '<br>Placa RBT-6A16 · Nota 4,96' : ''}`;
  if (ride.driver?.location && map) {
    driverMarker?.remove();
    driverMarker = L.marker([ride.driver.location.lat, ride.driver.location.lng], { icon: pin('#d26a35') }).addTo(map).bindPopup('Motorista');
  }
  if (ride.status === 'completed' || ride.status === 'cancelled') {
    requestButton.disabled = false;
    requestButton.textContent = 'Encontrar motorista';
    cancelButton.classList.add('hidden');
  }
  else setTimeout(refreshRide, 1200);
}

requestButton.addEventListener('click', async () => {
  try {
    requestButton.disabled = true;
    requestButton.textContent = 'Solicitando...';
    const response = await fetch('/v1/requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product_id: '016-comfort', payment_method_id: 'pix', distance_km: routeDistanceKm, start_lat: selectedRoute?.origin[0], start_lng: selectedRoute?.origin[1], end_lat: selectedRoute?.destination[0], end_lng: selectedRoute?.destination[1] }) });
    if (!response.ok) throw new Error('Não foi possível solicitar a corrida');
    const ride = await response.json();
    activeRide = ride.request_id;
    estimateBox.textContent = `R$ ${ride.estimate.amount.toFixed(2).replace('.', ',')}`;
    statusBox.classList.remove('hidden');
    cancelButton.classList.remove('hidden');
    statusBox.innerHTML = '<strong>Solicitação enviada.</strong><br>Buscando motorista na região...';
    requestButton.textContent = 'Corrida solicitada';
    refreshRide();
  } catch (error) {
    requestButton.disabled = false;
    requestButton.textContent = 'Tentar novamente';
    statusBox.classList.remove('hidden');
    statusBox.innerHTML = `<strong>${error.message}</strong>`;
  }
});

cancelButton.addEventListener('click', async () => {
  if (!activeRide) return;
  await fetch(`/v1/requests/${activeRide}`, { method: 'DELETE' });
  await refreshRide();
});

getEstimate();
initializeMap();
connectRealtime();
originInput.addEventListener('change', drawRoute);
destinationInput.addEventListener('change', drawRoute);
