const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Busboy = require('busboy');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const WebSocket = require('ws');
const { enabled: azureStorageEnabled, uploadDocument } = require('./storage/azure-blob');
const { createInfrastructure } = require('./infra');
const { rankDrivers } = require('./matching');
const { routeBetween } = require('./map-service');

const PORT = Number(process.env.PORT || 3000);
const publicDir = path.join(__dirname, 'public');
const rides = new Map();
const driverApplications = new Map();
const loginCodes = new Map();
const passengers = new Map();
const DRIVER_RIDE_FEE_CENTS = 100;
const documentsDir = path.join(__dirname, 'storage', 'documents');
fs.mkdirSync(documentsDir, { recursive: true });
const driver = { id: '00000000-0000-4000-8000-000000000016', name: 'Marcos Almeida', online: true, rating: 4.96, vehicle: 'Chevrolet Onix', plate: 'RBT-6A16', location: { lat: -21.1775, lng: -47.8103 } };
const drivers = [driver,
  { id: '00000000-0000-4000-8000-000000000017', name: 'Juliana Costa', online: true, rating: 4.88, vehicle: 'Renault Kwid', plate: 'D16-UBR2', location: { lat: -21.1812, lng: -47.8048 } },
  { id: '00000000-0000-4000-8000-000000000018', name: 'Rafael Lima', online: true, rating: 4.75, vehicle: 'Fiat Argo', plate: 'E16-UBR3', location: { lat: -21.1648, lng: -47.8175 } }];
const realtimeClients = new Set();
const infrastructure = createInfrastructure();
const jwtSecret = process.env.JWT_SECRET || 'local-demo-secret-change-before-production';
const adminEmail = process.env.ADMIN_EMAIL || 'admin@016ubercar.local';
const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

function broadcastLocation(updatedDriver = driver, rideId = null) {
  const message = JSON.stringify({ type: 'driver.location', ride_id: rideId, driver_id: updatedDriver.id, location: updatedDriver.location, timestamp: new Date().toISOString() });
  for (const client of realtimeClients) if (client.readyState === WebSocket.OPEN) client.send(message);
}

function publishRideEvent(ride, type, payload = {}) {
  return infrastructure.publishEvent(type, ride.request_id, payload).catch(error => console.error('Event publication failed:', error.message));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let raw = '';
    request.on('data', chunk => { raw += chunk; });
    request.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('JSON inválido')); }
    });
    request.on('error', reject);
  });
}

function requireAdmin(request, response) {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
  try {
    return jwt.verify(token, jwtSecret).role === 'admin';
  } catch {
    json(response, 401, { error: 'Autenticação administrativa necessária' });
    return false;
  }
}

function readDriverMultipart(request, applicationId) {
  return new Promise((resolve, reject) => {
    const fields = { documents: [] };
    let parser;
    try { parser = Busboy({ headers: request.headers, limits: { files: 4, fileSize: 8 * 1024 * 1024 } }); } catch { reject(new Error('Formulário de documentos inválido')); return; }
    parser.on('field', (name, value) => { fields[name] = value; });
    parser.on('file', (name, file, info) => {
      const extension = path.extname(info.filename || '').toLowerCase();
      const allowed = ['.jpg', '.jpeg', '.png', '.pdf'];
      if (!allowed.includes(extension)) { file.resume(); return; }
      const storedName = `${applicationId}-${name}-${crypto.randomUUID()}${extension}`;
      const storedPath = path.join(documentsDir, storedName);
      const output = fs.createWriteStream(storedPath, { flags: 'wx' });
      file.pipe(output);
      output.on('finish', () => fields.documents.push({ type: name, filename: info.filename, path: `storage/documents/${storedName}`, mime_type: info.mimeType }));
      output.on('error', reject);
    });
    parser.on('error', reject);
    parser.on('finish', () => resolve(fields));
    request.pipe(parser);
  });
}

function estimate(body) {
  const distance = Number.isFinite(Number(body.distance_km)) && Number(body.distance_km) > 0 ? Number(body.distance_km) : 5.8;
  const minutes = 16;
  const pricePerKm = 6.25;
  const amount = distance * pricePerKm;
  return { currency: 'BRL', distance_km: distance, duration_minutes: minutes, price_per_km: pricePerKm, amount: Number(amount.toFixed(2)), surge_multiplier: 1 };
}

function scheduleRide(ride) {
  const steps = [
    ['accepted', 2200],
    ['driver_en_route', 4200],
    ['in_progress', 9000],
    ['completed', 9000]
  ];
  let elapsed = 0;
  for (const [status, delay] of steps) {
    elapsed += delay;
    setTimeout(() => {
      if (!rides.has(ride.request_id)) return;
      ride.status = status;
      ride.updated_at = new Date().toISOString();
      ride.driver.location = status === 'in_progress' ? { lat: -21.1772, lng: -47.8103 } : { lat: -21.1698, lng: -47.8067 };
      if (status === 'completed') ride.price_final = ride.estimate.amount;
      const eventType = { accepted: 'RideAccepted', driver_en_route: 'DriverEnRoute', in_progress: 'RideStarted', completed: 'RideCompleted' }[status];
      publishRideEvent(ride, eventType, { driver_id: ride.driver.id, price_final: ride.price_final });
      infrastructure.updateRideStatus(ride.request_id, status, ride.driver.id, ride.price_final).catch(error => console.error('Ride persistence failed:', error.message));
      infrastructure.setDriverLocation(ride.driver.id, ride.driver.location, ride.request_id).catch(error => console.error('Location persistence failed:', error.message));
      broadcastLocation(ride.driver, ride.request_id);
    }, elapsed);
  }
}

function serveStatic(request, response) {
  const requested = request.url === '/' ? '/index.html' : request.url;
  const filePath = path.normalize(path.join(publicDir, requested));
  if (!filePath.startsWith(publicDir)) return json(response, 403, { error: 'Acesso negado' });
  fs.readFile(filePath, (error, data) => {
    if (error) return json(response, 404, { error: 'Arquivo não encontrado' });
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
    response.writeHead(200, { 'Content-Type': `${types[path.extname(filePath)] || 'application/octet-stream'}; charset=utf-8` });
    response.end(data);
  });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  try {
    if (request.method === 'GET' && url.pathname === '/health') return json(response, 200, { status: 'ok', service: '016-ubercar-demo' });
    if (request.method === 'POST' && url.pathname === '/v1/auth/admin') {
      const body = await readBody(request);
      const passwordMatches = process.env.ADMIN_PASSWORD_HASH ? await bcrypt.compare(String(body.password || ''), process.env.ADMIN_PASSWORD_HASH) : body.password === adminPassword;
      if (body.email !== adminEmail || !passwordMatches) return json(response, 401, { error: 'E-mail ou senha inválidos' });
      const token = jwt.sign({ sub: adminEmail, role: 'admin' }, jwtSecret, { expiresIn: '8h' });
      return json(response, 200, { access_token: token, token_type: 'Bearer', expires_in: 28800 });
    }
    if (request.method === 'POST' && url.pathname === '/v1/auth/request-code') {
      const body = await readBody(request);
      const phone = String(body.phone || '').replace(/\D/g, '');
      if (phone.length < 10) return json(response, 400, { error: 'Informe um celular válido' });
      const code = '016016';
      loginCodes.set(phone, code);
      return json(response, 200, { accepted: true, channel: 'sms_or_whatsapp', ...(process.env.NODE_ENV !== 'production' ? { demo_code: code } : {}) });
    }
    if (request.method === 'POST' && url.pathname === '/v1/passengers/register') {
      const body = await readBody(request);
      const name = String(body.name || '').trim();
      const phone = String(body.phone || '').replace(/\D/g, '');
      const email = String(body.email || '').trim().toLowerCase();
      if (name.length < 3 || phone.length < 10) return json(response, 400, { error: 'Informe nome completo e celular válido' });
      passengers.set(phone, { id: `passenger_${crypto.randomUUID().slice(0, 8)}`, name, phone, email: email || null, created_at: new Date().toISOString() });
      return json(response, 201, { created: true, phone });
    }
    if (request.method === 'POST' && url.pathname === '/v1/auth/verify-code') {
      const body = await readBody(request);
      const phone = String(body.phone || '').replace(/\D/g, '');
      if (loginCodes.get(phone) !== String(body.code || '')) return json(response, 401, { error: 'Código inválido ou expirado' });
      loginCodes.delete(phone);
      const token = jwt.sign({ sub: phone, role: 'passenger' }, jwtSecret, { expiresIn: '30d' });
      return json(response, 200, { access_token: token, token_type: 'Bearer', expires_in: 2592000 });
    }
    if (request.method === 'GET' && url.pathname === '/v1/products') return json(response, 200, [{ product_id: '016-comfort', display_name: '016 Comfort', capacity: 4, price: 2.05 }]);
    if (request.method === 'GET' && url.pathname === '/v1/driver/dashboard') return json(response, 200, { ...driver, active_rides: [...rides.values()].filter(ride => ride.status !== 'completed' && ride.status !== 'cancelled') });
    if (request.method === 'POST' && url.pathname === '/v1/driver/status') {
      const body = await readBody(request);
      driver.online = Boolean(body.online);
      return json(response, 200, driver);
    }
    if (request.method === 'POST' && url.pathname === '/v1/driver/location') {
      const body = await readBody(request);
      if (!Number.isFinite(Number(body.lat)) || !Number.isFinite(Number(body.lng))) return json(response, 400, { error: 'Latitude e longitude são obrigatórias' });
      const location = { lat: Number(body.lat), lng: Number(body.lng), accuracy_m: Number(body.accuracy_m) || null, speed_kmh: Number(body.speed_kmh) || null, heading: Number(body.heading) || null };
      if (location.lat < -90 || location.lat > 90 || location.lng < -180 || location.lng > 180) return json(response, 400, { error: 'Coordenadas fora do intervalo válido' });
      driver.location = { lat: location.lat, lng: location.lng };
      await infrastructure.setDriverLocation(driver.id, location);
      broadcastLocation();
      return json(response, 202, { accepted: true, location: driver.location });
    }
    if (request.method === 'POST' && url.pathname === '/v1/driver/register') {
      const id = `application_${crypto.randomUUID().slice(0, 8)}`;
      const body = request.headers['content-type']?.startsWith('multipart/form-data') ? await readDriverMultipart(request, id) : await readBody(request);
      if (!body.name || !body.phone || !body.city || !body.plate || !body.vehicle) return json(response, 400, { error: 'Preencha nome, telefone, cidade, placa e veículo' });
      const documents = body.documents || [];
      if (azureStorageEnabled && documents.length) {
        try { await Promise.all(documents.map(async document => Object.assign(document, await uploadDocument(document.path, document.mime_type)))); }
        catch { return json(response, 502, { error: 'Não foi possível armazenar os documentos no Azure Blob' }); }
      }
      const application = { id, name: body.name, phone: body.phone, city: body.city, plate: body.plate.toUpperCase(), vehicle: body.vehicle, documents, status: 'pending', created_at: new Date().toISOString() };
      driverApplications.set(id, application);
      return json(response, 201, application);
    }
    if (request.method === 'GET' && url.pathname === '/v1/admin/driver-applications') {
      if (!requireAdmin(request, response)) return;
      return json(response, 200, [...driverApplications.values()]);
    }
    const applicationDecision = url.pathname.match(/^\/v1\/admin\/driver-applications\/([^/]+)\/(approve|reject)$/);
    if (request.method === 'POST' && applicationDecision) {
      if (!requireAdmin(request, response)) return;
      const application = driverApplications.get(applicationDecision[1]);
      if (!application) return json(response, 404, { error: 'Cadastro não encontrado' });
      application.status = applicationDecision[2] === 'approve' ? 'approved' : 'rejected';
      application.reviewed_at = new Date().toISOString();
      return json(response, 200, application);
    }
    if (request.method === 'GET' && url.pathname === '/v1/admin/summary') {
      if (!requireAdmin(request, response)) return;
      const completedRides = [...rides.values()].filter(ride => ride.status === 'completed');
      return json(response, 200, { online_drivers: driver.online ? 1 : 0, active_rides: [...rides.values()].filter(ride => !['completed', 'cancelled'].includes(ride.status)).length, completed_today: completedRides.length, gross_today: completedRides.reduce((total, ride) => total + (ride.price_final || 0), 0), platform_fees_today: Number((completedRides.reduce((total, ride) => total + (ride.driver_fee_cents || 0), 0) / 100).toFixed(2)) });
    }
    if (request.method === 'GET' && url.pathname === '/v1/estimates/price') return json(response, 200, [estimate(Object.fromEntries(url.searchParams))]);
    if (request.method === 'GET' && url.pathname === '/v1/maps/route') {
      const origin = { lat: Number(url.searchParams.get('start_lat')), lng: Number(url.searchParams.get('start_lng')) };
      const destination = { lat: Number(url.searchParams.get('end_lat')), lng: Number(url.searchParams.get('end_lng')) };
      if (![origin.lat, origin.lng, destination.lat, destination.lng].every(Number.isFinite)) return json(response, 400, { error: 'Coordenadas de origem e destino são obrigatórias' });
      return json(response, 200, await routeBetween(origin, destination));
    }
    if (request.method === 'POST' && url.pathname === '/v1/requests') {
      const body = await readBody(request);
      const id = infrastructure.pool ? crypto.randomUUID() : `ride_${crypto.randomUUID().slice(0, 8)}`;
      const origin = { lat: Number(body.start_lat ?? body.origin_lat), lng: Number(body.start_lng ?? body.origin_lng) };
      const destination = { lat: Number(body.end_lat ?? body.destination_lat), lng: Number(body.end_lng ?? body.destination_lng) };
      if (![origin.lat, origin.lng, destination.lat, destination.lng].every(Number.isFinite)) return json(response, 400, { error: 'Origem e destino são obrigatórios' });
      const route = await routeBetween(origin, destination);
      const candidates = drivers.filter(item => item.online).map(item => ({ ...item.location, id: item.id, name: item.name, rating: item.rating, reliability: 0.8 + (item.rating - 4) / 5, idle_seconds: item.id === driver.id ? 120 : 240 }));
      const rankedDrivers = rankDrivers(candidates, origin);
      const assignedDriver = rankedDrivers[0] ? drivers.find(item => item.id === rankedDrivers[0].id) : null;
      const ride = {
        request_id: id, status: 'searching', created_at: new Date().toISOString(),
        estimate: estimate({ ...body, distance_km: route.distance_km }), price_final: null, route,
        driver: assignedDriver ? { ...assignedDriver } : null
      };
      rides.set(id, ride);
      ride.origin = origin;
      ride.destination = destination;
      infrastructure.persistRide(ride, body.passenger_id).catch(error => console.error('Ride persistence failed:', error.message));
      publishRideEvent(ride, 'RideRequested', { origin, destination: { lat: Number(body.end_lat ?? body.destination_lat), lng: Number(body.end_lng ?? body.destination_lng) } });
      if (rankedDrivers.length) publishRideEvent(ride, 'DriverOfferCreated', { driver_id: rankedDrivers[0].id, score: rankedDrivers[0].score, eta_seconds: rankedDrivers[0].eta_seconds });
      scheduleRide(ride);
      return json(response, 201, { request_id: id, status: ride.status, eta_seconds: 180, estimate: ride.estimate });
    }
    const rideMatch = url.pathname.match(/^\/v1\/requests\/([^/]+)$/);
    const driverAction = url.pathname.match(/^\/v1\/driver\/requests\/([^/]+)\/(accept|start|finish)$/);
    if (request.method === 'POST' && driverAction) {
      const ride = rides.get(driverAction[1]);
      if (!ride) return json(response, 404, { error: 'Corrida não encontrada' });
      const actionStatus = { accept: 'accepted', start: 'in_progress', finish: 'completed' }[driverAction[2]];
      ride.status = actionStatus;
      ride.updated_at = new Date().toISOString();
      if (actionStatus === 'completed') {
        ride.price_final = ride.estimate.amount;
        ride.driver_fee_cents = DRIVER_RIDE_FEE_CENTS;
        ride.driver_net_amount = Number((ride.price_final - DRIVER_RIDE_FEE_CENTS / 100).toFixed(2));
      }
      infrastructure.updateRideStatus(ride.request_id, actionStatus, ride.driver?.id, ride.price_final).catch(error => console.error('Ride persistence failed:', error.message));
      publishRideEvent(ride, actionStatus === 'accepted' ? 'RideAccepted' : actionStatus === 'in_progress' ? 'RideStarted' : 'RideCompleted', { driver_id: ride.driver?.id, price_final: ride.price_final });
      return json(response, 200, ride);
    }
    if (request.method === 'GET' && rideMatch) {
      const ride = rides.get(rideMatch[1]);
      return ride ? json(response, 200, ride) : json(response, 404, { error: 'Corrida não encontrada' });
    }
    if (request.method === 'DELETE' && rideMatch) {
      const ride = rides.get(rideMatch[1]);
      if (!ride) return json(response, 404, { error: 'Corrida não encontrada' });
      ride.status = 'cancelled'; ride.updated_at = new Date().toISOString();
      infrastructure.updateRideStatus(ride.request_id, 'cancelled').catch(error => console.error('Ride persistence failed:', error.message));
      publishRideEvent(ride, 'RideCancelled', { reason: 'passenger_request' });
      return json(response, 200, ride);
    }
    if (request.method === 'GET') return serveStatic(request, response);
    return json(response, 404, { error: 'Rota não encontrada' });
  } catch (error) { return json(response, 400, { error: error.message }); }
});

if (require.main === module) {
  infrastructure.connect()
    .then(() => server.listen(PORT, () => console.log(`016 Ubercar em http://localhost:${PORT}`)))
    .catch(error => {
      console.error('Infrastructure unavailable:', error.message);
      server.listen(PORT, () => console.log(`016 Ubercar em http://localhost:${PORT} (fallback local)`));
    });
}
const websocketServer = new WebSocket.Server({ noServer: true });
server.on('upgrade', (request, socket, head) => {
  if (new URL(request.url, `http://${request.headers.host}`).pathname !== '/v1/realtime') { socket.destroy(); return; }
  websocketServer.handleUpgrade(request, socket, head, client => websocketServer.emit('connection', client, request));
});
websocketServer.on('connection', client => {
  realtimeClients.add(client);
  client.send(JSON.stringify({ type: 'connected', driver: driver.id, location: driver.location }));
  client.on('close', () => realtimeClients.delete(client));
});
module.exports = { server, estimate, rides };
