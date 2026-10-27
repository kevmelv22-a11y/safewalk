// Donkere kaartstijl (Google Maps). Op iOS (Apple Maps) volgt de kaart automatisch het systeemthema.
export const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#0d1530' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#a5adc8' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#080f23' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1c2648' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#8a93b2' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'simplified' }] },
  { featureType: 'water', stylers: [{ color: '#080f23' }] },
];
