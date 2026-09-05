# 016 Ubercar MVP

Demo local de uma plataforma de mobilidade para o DDD 016, com uma API própria em formato compatível com os endpoints essenciais de apps de transporte.

## Executar hoje

Requer Node.js 18 ou superior. Não há dependências externas.

```bash
npm test
npm start
```

Abra `http://localhost:3000` no navegador. A tela permite consultar uma estimativa e solicitar uma corrida simulada. O backend avança automaticamente por `searching`, `accepted`, `driver_en_route`, `in_progress` e `completed`. Com `DATABASE_URL` e `REDIS_URL`, localização, telemetria, outbox e eventos usam PostgreSQL/PostGIS e Redis; sem essas variáveis, o fallback local continua disponível.

## Endpoints demonstrados

- `GET /health`
- `GET /v1/products`
- `GET /v1/estimates/price`
- `GET /v1/maps/route`
- `POST /v1/requests`
- `GET /v1/requests/:request_id`
- `DELETE /v1/requests/:request_id`

O contrato completo está em `openapi/uber_compat_openapi.yaml`. Este demo não usa a API privada da Uber nem processa pagamentos reais.

O endpoint de rota usa OSRM/OpenStreetMap para desenvolvimento, calcula distância, duração e geometria da rota no backend e retorna um fallback aproximado quando o provedor externo está indisponível. Para produção, substitua `map-service.js` por Mapbox, Google Maps ou HERE com chave protegida no servidor.

Para ativar a infraestrutura local:

```env
DATABASE_URL=postgresql://ubercar:change-me@localhost:5432/ubercar
REDIS_URL=redis://localhost:6379
```

Para preparar o ambiente operacional, consulte `OPERACAO.md` e copie `.env.example` para `.env`. O `docker-compose.yml` fornece PostgreSQL/PostGIS e Redis para desenvolvimento.
