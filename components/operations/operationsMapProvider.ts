type GoogleMapStyle = {
  featureType?: string;
  elementType?: string;
  stylers?: Array<{ color?: string; visibility?: string; saturation?: number; lightness?: number; weight?: number }>;
};

type GoogleMapOptions = {
  center: { lat: number; lng: number };
  zoom: number;
  styles?: GoogleMapStyle[];
  disableDefaultUI?: boolean;
  gestureHandling?: string;
  clickableIcons?: boolean;
  backgroundColor?: string;
};

type GoogleMapInstance = {
  setCenter: (pos: { lat: number; lng: number }) => void;
  setZoom: (zoom: number) => void;
  fitBounds: (bounds: GoogleLatLngBounds, padding?: number) => void;
};

type GoogleLatLngBounds = {
  extend: (pos: { lat: number; lng: number }) => void;
};

type GoogleSize = {
  width: number;
  height: number;
};

type GooglePoint = {
  x: number;
  y: number;
};

type GoogleMarkerIcon = {
  url: string;
  scaledSize?: GoogleSize;
  anchor?: GooglePoint;
};

type GoogleMarkerOptions = {
  position: { lat: number; lng: number };
  map: GoogleMapInstance;
  icon?: GoogleMarkerIcon;
  title?: string;
  zIndex?: number;
};

type GoogleMarkerInstance = {
  setMap: (map: GoogleMapInstance | null) => void;
  setPosition: (pos: { lat: number; lng: number }) => void;
  setIcon: (icon: GoogleMarkerIcon) => void;
  setZIndex: (zIndex: number) => void;
  addListener: (event: 'click', handler: () => void) => { remove: () => void };
};

type GoogleGeocoderResult = {
  geometry: { location: { lat: () => number; lng: () => number } };
};

export type GoogleGeocoder = {
  geocode: (
    request: { address: string },
    callback: (results: GoogleGeocoderResult[] | null, status: string) => void
  ) => void;
};

export type GoogleMapsApi = {
  maps: {
    Map: new (element: HTMLElement, options: GoogleMapOptions) => GoogleMapInstance;
    Marker: new (options: GoogleMarkerOptions) => GoogleMarkerInstance;
    LatLngBounds: new () => GoogleLatLngBounds;
    Size: new (width: number, height: number) => GoogleSize;
    Point: new (x: number, y: number) => GooglePoint;
    Geocoder: new () => GoogleGeocoder;
  };
};

export type MapPin = {
  id: string;
  type: 'job' | 'crew';
  lat: number;
  lng: number;
  color: string;
  haloColor?: string | null;
  label: string;
  onClick: () => void;
};

export type MapProvider = {
  setPins: (pins: MapPin[], options?: { focusId?: string | null; fit?: boolean }) => void;
  destroy: () => void;
};

const MAP_STYLE: GoogleMapStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#101826' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#101826' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8ea0b8' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#2a364b' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#7a8aa4' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1f2a3f' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#2f3d55' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9aa9c1' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0b111b' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#60708d' }] },
];

let googleMapsPromise: Promise<GoogleMapsApi | null> | null = null;

function isGoogleMapsApi(value: unknown): value is GoogleMapsApi {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  const maps = record.maps;
  if (!maps || typeof maps !== 'object') return false;
  const mapCtor = (maps as Record<string, unknown>).Map;
  return typeof mapCtor === 'function';
}

export function loadGoogleMaps(apiKey: string): Promise<GoogleMapsApi | null> {
  if (!apiKey) return Promise.resolve(null);
  if (typeof window === 'undefined') return Promise.resolve(null);
  const existing = (window as unknown as { google?: unknown }).google;
  if (isGoogleMapsApi(existing)) return Promise.resolve(existing);

  if (googleMapsPromise) return googleMapsPromise;

  googleMapsPromise = new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      const loaded = (window as unknown as { google?: unknown }).google;
      resolve(isGoogleMapsApi(loaded) ? loaded : null);
    };
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });

  return googleMapsPromise;
}

function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function buildJobPin(color: string, haloColor?: string | null): string {
  const stroke = haloColor ?? 'transparent';
  return svgToDataUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
      <path d="M14 0C7.1 0 1.5 5.6 1.5 12.5c0 7.8 9.6 21.6 12.5 23.5 2.9-1.9 12.5-15.7 12.5-23.5C26.5 5.6 20.9 0 14 0z" fill="${color}" stroke="${stroke}" stroke-width="2"/>
      <circle cx="14" cy="12.5" r="4.5" fill="#0b111b"/>
    </svg>`
  );
}

function buildCrewPin(color: string, haloColor?: string | null): string {
  const stroke = haloColor ?? 'transparent';
  return svgToDataUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26">
      <circle cx="13" cy="13" r="9.5" fill="${color}" stroke="${stroke}" stroke-width="2"/>
      <circle cx="13" cy="13" r="4" fill="#0b111b"/>
    </svg>`
  );
}

export function createGoogleMapsProvider(params: {
  api: GoogleMapsApi;
  container: HTMLElement;
  center: { lat: number; lng: number };
  zoom: number;
}): MapProvider {
  const { api, container, center, zoom } = params;
  const map = new api.maps.Map(container, {
    center,
    zoom,
    styles: MAP_STYLE,
    disableDefaultUI: true,
    clickableIcons: false,
    gestureHandling: 'greedy',
    backgroundColor: '#101826',
  });

  const markers = new Map<string, GoogleMarkerInstance>();
  let didFit = false;

  const setPins: MapProvider['setPins'] = (pins, options) => {
    const focusId = options?.focusId ?? null;
    const nextIds = new Set(pins.map((pin) => pin.id));

    for (const [id, marker] of markers.entries()) {
      if (!nextIds.has(id)) {
        marker.setMap(null);
        markers.delete(id);
      }
    }

    pins.forEach((pin) => {
      const iconUrl = pin.type === 'job' ? buildJobPin(pin.color, pin.haloColor) : buildCrewPin(pin.color, pin.haloColor);
      const icon: GoogleMarkerIcon = pin.type === 'job'
        ? {
            url: iconUrl,
            scaledSize: new api.maps.Size(28, 36),
            anchor: new api.maps.Point(14, 34),
          }
        : {
            url: iconUrl,
            scaledSize: new api.maps.Size(26, 26),
            anchor: new api.maps.Point(13, 13),
          };

      const zIndex = pin.id === focusId ? 1000 : pin.type === 'crew' ? 600 : 500;
      const existing = markers.get(pin.id);
      if (existing) {
        existing.setPosition({ lat: pin.lat, lng: pin.lng });
        existing.setIcon(icon);
        existing.setZIndex(zIndex);
        return;
      }

      const marker = new api.maps.Marker({
        position: { lat: pin.lat, lng: pin.lng },
        map,
        icon,
        title: pin.label,
        zIndex,
      });
      marker.addListener('click', pin.onClick);
      markers.set(pin.id, marker);
    });

    if (!didFit && pins.length > 0) {
      const bounds = new api.maps.LatLngBounds();
      pins.forEach((pin) => bounds.extend({ lat: pin.lat, lng: pin.lng }));
      map.fitBounds(bounds, 64);
      didFit = true;
    } else if (options?.fit && pins.length > 0) {
      const bounds = new api.maps.LatLngBounds();
      pins.forEach((pin) => bounds.extend({ lat: pin.lat, lng: pin.lng }));
      map.fitBounds(bounds, 64);
    } else if (pins.length === 0) {
      map.setCenter(center);
      map.setZoom(10);
      didFit = false;
    }
  };

  return {
    setPins,
    destroy: () => {
      markers.forEach((marker) => marker.setMap(null));
      markers.clear();
    },
  };
}
