# 016 Ubercar Mobile

App iOS/Android em Expo/React Native conectado à API local do 016 Ubercar.

## Executar no Windows

Instale Node.js 18+ e o Expo Go no iPhone.

```powershell
cd mobile
npm install
$env:EXPO_PUBLIC_API_URL="http://SEU-IP-LOCAL:3000"
npm start
```

Escaneie o QR Code com o Expo Go. O computador e o iPhone devem estar na mesma rede Wi-Fi. Para o simulador iOS, use `http://localhost:3000`.

## Gerar app iOS

```powershell
npm install -g eas-cli
eas login
eas build:configure
eas build --platform ios --profile preview
```

O build de iOS exige uma conta Apple Developer e as credenciais da Apple. Para publicar na App Store, use o perfil de produção e configure o bundle identifier `br.com.016ubercar.app`.

O app demonstra: origem/destino livres, geocodificação, rota OSRM, cálculo de R$ 6,25/km, solicitação de corrida e acompanhamento de status pela API. O mapa usa `react-native-maps` e OpenStreetMap via rota OSRM.
