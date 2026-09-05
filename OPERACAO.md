# Operação do 016 Ubercar

O projeto atual contém um demo funcional. Para operar com passageiros e motoristas reais, siga esta ordem.

## 1. Ambiente local

Requisitos: Node.js 18+ e Docker Desktop.

```bash
Copy-Item .env.example .env
npm test
docker compose up -d
npm start
```

Acesse `http://localhost:3000`, `/driver.html` e `/admin.html`.

## 2. Serviços obrigatórios antes do piloto

- **Banco:** executar `database/schema.sql` no PostgreSQL com PostGIS e configurar `DATABASE_URL` e `REDIS_URL`. O módulo `infra.js` grava eventos na outbox, posições históricas no PostGIS e presença/localização atual no Redis GEO.
- **Mapas:** criar conta Mapbox ou Google Maps, configurar geocoding, rotas, matriz de distância e limites de uso. OSRM/OpenStreetMap serve para testes; não deve ser tratado como SLA de produção.
- **Pagamentos Efí:** abrir conta e criar aplicação em homologação; configurar `EFI_CLIENT_ID`, `EFI_CLIENT_SECRET`, certificado `.p12`, senha do certificado e `EFI_PIX_KEY`. Ativar API Pix, API Cobranças/checkout para cartão, webhooks mTLS/HMAC e split. O app nunca recebe dados brutos do cartão.
- **Modelo comercial inicial:** cobrar do motorista uma taxa fixa de R$ 1,00 somente por corrida concluída. Registrar a taxa em centavos, exibir o valor líquido no extrato e conciliar a cobrança no gateway; não cobrar corrida cancelada ou não iniciada.
- **Notificações:** configurar Firebase Cloud Messaging e APNs.
- **Autenticação:** implementar OTP por telefone, refresh token, RBAC para admin e recuperação de conta.
- **Legal:** validar LGPD, termos de uso, política de privacidade, regras municipais e contratação dos motoristas.

## 3. Critérios de aceite do piloto

- Corrida criada e persistida mesmo após reiniciar o servidor.
- Localização do motorista atualizada em tempo real.
- Cobrança idempotente e confirmada por webhook.
- Estorno e cancelamento auditáveis.
- Admin protegido por autenticação e logs de auditoria.
- Alertas para API fora do ar, falha de pagamento e ausência de motoristas.
- Teste com motoristas reais em Ribeirão Preto e cidades escolhidas do DDD 016.

## Estado atual

O servidor local usa memória e simulação de corrida. As páginas e endpoints são uma base de demonstração; não devem receber pagamentos, documentos ou dados reais antes das etapas acima.

## Efí: checklist de conexão

1. Criar a aplicação no painel Efí e baixar o certificado de homologação.
2. Guardar o `.p12` em `certs/` sem versioná-lo.
3. Preencher `.env` a partir de `.env.example`.
4. Publicar o webhook em HTTPS; a API Pix da Efí usa mTLS e pode acrescentar `/pix` à URL cadastrada.
5. Testar uma cobrança de homologação e confirmar o webhook antes de ativar produção.

Documentação oficial: https://dev.efipay.com.br/docs/api-pix/credenciais
