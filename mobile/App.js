import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
const fallbackOrigin = { latitude: -21.1775, longitude: -47.8103 };
const fallbackDestination = { latitude: -21.1848, longitude: -47.8087 };

export default function App() {
  const [origin, setOrigin] = useState('Centro, Ribeirão Preto - SP');
  const [destination, setDestination] = useState('RibeirãoShopping, Ribeirão Preto - SP');
  const [route, setRoute] = useState([fallbackOrigin, fallbackDestination]);
  const [distance, setDistance] = useState(4.52);
  const [ride, setRide] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadRoute(); }, []);

  async function geocode(value, fallback) {
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&q=${encodeURIComponent(value)}`, { headers: { Accept: 'application/json' } });
      const [place] = await response.json();
      return place ? { latitude: Number(place.lat), longitude: Number(place.lon) } : fallback;
    } catch { return fallback; }
  }

  async function loadRoute() {
    setLoading(true);
    const start = await geocode(origin, fallbackOrigin);
    const end = await geocode(destination, fallbackDestination);
    try {
      const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${start.longitude},${start.latitude};${end.longitude},${end.latitude}?overview=full&geometries=geojson`);
      const data = await response.json();
      const points = data.routes?.[0]?.geometry?.coordinates?.map(([longitude, latitude]) => ({ latitude, longitude }));
      setRoute(points?.length ? points : [start, end]);
      if (data.routes?.[0]) setDistance(Number((data.routes[0].distance / 1000).toFixed(2)));
    } catch { setRoute([start, end]); }
    setLoading(false);
  }

  async function requestRide() {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/v1/requests`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product_id: '016-comfort', payment_method_id: 'pix', distance_km: distance }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível solicitar a corrida');
      setRide({ request_id: data.request_id, status: data.status, amount: data.estimate.amount });
    } catch (error) { Alert.alert('Não foi possível pedir a corrida', error.message); }
    setLoading(false);
  }

  useEffect(() => {
    if (!ride || ['completed', 'cancelled'].includes(ride.status)) return undefined;
    const timer = setInterval(async () => {
      try { const response = await fetch(`${API_URL}/v1/requests/${ride.request_id}`); const data = await response.json(); setRide(current => ({ ...current, ...data, amount: data.price_final || current.amount })); } catch { /* mantém o último status */ }
    }, 1500);
    return () => clearInterval(timer);
  }, [ride]);

  const amount = (distance * 6.25).toFixed(2).replace('.', ',');
  return <SafeAreaView style={styles.page}><View style={styles.header}><Text style={styles.logo}><Text style={styles.logoMark}>016</Text> ubercar</Text><Text style={styles.area}>Ribeirão Preto e região</Text></View><Text style={styles.title}>Peça uma <Text style={styles.accent}>viagem.</Text></Text><View style={styles.form}><TextInput value={origin} onChangeText={setOrigin} onEndEditing={loadRoute} style={styles.input} placeholder="Origem"/><TextInput value={destination} onChangeText={setDestination} onEndEditing={loadRoute} style={styles.input} placeholder="Destino"/></View><MapView style={styles.map} initialRegion={{ ...fallbackOrigin, latitudeDelta: .05, longitudeDelta: .05 }}><Polyline coordinates={route} strokeColor="#9aad27" strokeWidth={5}/><Marker coordinate={route[0]} title="Origem"/><Marker coordinate={route[route.length - 1]} title="Destino" pinColor="#9aad27"/></MapView><View style={styles.summary}><View><Text style={styles.label}>{distance.toFixed(2).replace('.', ',')} km de rota</Text><Text style={styles.price}>R$ {amount}</Text></View><Text style={styles.rate}>R$ 6,25/km</Text></View>{ride ? <View style={styles.status}><Text style={styles.statusTitle}>{ride.status === 'searching' ? 'Buscando motorista...' : ride.status === 'accepted' ? 'Motorista encontrado' : ride.status === 'completed' ? 'Viagem concluída' : 'Viagem em andamento'}</Text><Text style={styles.statusText}>Código {ride.request_id}</Text></View> : <Pressable style={styles.button} onPress={requestRide} disabled={loading}>{loading ? <ActivityIndicator color="#18221d"/> : <Text style={styles.buttonText}>Encontrar motorista <Text style={styles.arrow}>→</Text></Text>}</Pressable>}</SafeAreaView>;
}

const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: '#fffdf8', paddingHorizontal: 20 }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: '#dfe3d8' }, logo: { color: '#18221d', fontSize: 20, fontWeight: '700' }, logoMark: { backgroundColor: '#d5f05d', paddingHorizontal: 4 }, area: { color: '#718079', fontSize: 11 }, title: { color: '#18221d', fontSize: 36, fontWeight: '700', marginTop: 28, marginBottom: 20 }, accent: { color: '#91a92d' }, form: { gap: 12 }, input: { borderBottomWidth: 1, borderBottomColor: '#dfe3d8', paddingVertical: 12, fontSize: 16, color: '#18221d' }, map: { height: 245, marginTop: 22, borderRadius: 4 }, summary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 18 }, label: { color: '#718079', fontSize: 12 }, price: { color: '#18221d', fontSize: 25, fontWeight: '700', marginTop: 3 }, rate: { color: '#718079', fontSize: 12 }, button: { backgroundColor: '#d5f05d', padding: 18, borderRadius: 3 }, buttonText: { color: '#18221d', fontSize: 15, fontWeight: '700' }, arrow: { fontSize: 20 }, status: { backgroundColor: '#18221d', padding: 18, borderRadius: 3 }, statusTitle: { color: '#d5f05d', fontSize: 16, fontWeight: '700' }, statusText: { color: '#bac5bb', marginTop: 6, fontSize: 12 } });
