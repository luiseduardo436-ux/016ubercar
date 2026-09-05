# Deploy do 016 Ubercar

O projeto está pronto para serviços que aceitam Docker. O serviço web deve executar `node server.js` e expor a porta definida por `PORT`.

## Variáveis obrigatórias

Configure no provedor, sem commitar valores reais:

```env
NODE_ENV=production
PORT=3000
PUBLIC_BASE_URL=https://016ubercar.com.br
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_SECRET=gere-um-segredo-longo-e-aleatorio
ADMIN_EMAIL=seu-email-administrativo
ADMIN_PASSWORD_HASH=hash-bcrypt-da-senha
SMS_PROVIDER=seu-provedor-de-sms
MAP_PROVIDER=osrm
STORAGE_PROVIDER=local
MAPBOX_ACCESS_TOKEN=token-do-mapbox
SMS_PROVIDER=zenvia
ZENVIA_API_TOKEN=token-da-zenvia
ZENVIA_FROM=016Ubercar
```

O Render executa `npm run migrate` antes do deploy para aplicar `database/schema.sql`. O PostgreSQL precisa oferecer PostGIS. O serviço precisa ter PostgreSQL persistente e Redis persistente; não use os containers locais em produção.

## Render

1. Crie um repositório GitHub com este diretório e envie os arquivos do projeto.
2. No Render, selecione **New > Blueprint** e escolha o repositório.
3. O arquivo `render.yaml` criará o serviço web, PostgreSQL e Redis.
4. Preencha `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` e `SMS_PROVIDER` quando o Render solicitar.
5. Preencha `MAPBOX_ACCESS_TOKEN`, `ZENVIA_API_TOKEN` e `ZENVIA_FROM` para ativar rota comercial e OTP real.
6. Faça um deploy e confirme `GET /health`.
7. No painel do domínio, crie os registros DNS mostrados em **Settings > Custom Domains**.
8. Aguarde o certificado HTTPS e acesse `https://016ubercar.com.br/admin-login.html`.

O plano gratuito do Render pode suspender o serviço por inatividade. Para operação real com corridas, use um plano pago e armazenamento externo para documentos.

## Outros provedores

1. Crie um serviço web a partir deste diretório usando o `Dockerfile`.
2. Crie PostgreSQL e Redis no mesmo provedor ou informe as URLs de serviços gerenciados.
3. Configure as variáveis acima.
4. Faça um deploy e confirme `GET /health`.
5. No painel do domínio, crie um registro `A` ou `CNAME` conforme o provedor indicar.
6. Adicione `016ubercar.com.br` e `www.016ubercar.com.br` como domínios personalizados.
7. Ative HTTPS automático e altere `PUBLIC_BASE_URL` para `https://016ubercar.com.br`.

## Verificação pós-deploy

```powershell
Invoke-RestMethod https://016ubercar.com.br/health
```

O resultado esperado contém `status: ok`. Não publique o arquivo `.env`, certificados Efí, tokens de mapas ou credenciais administrativas.