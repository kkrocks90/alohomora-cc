interface LatLng {
  lat(): number;
  lng(): number;
}

interface AddressComponent {
  long_name: string;
  types: string[];
}

interface GeocodeResult {
  address_components: AddressComponent[];
  formatted_address: string;
  geometry: { location: LatLng };
}

interface GoogleMapsApi {
  Map: new (element: HTMLElement, options: {
    center: { lat: number; lng: number };
    zoom: number;
    clickableIcons: boolean;
    mapTypeControl: boolean;
    streetViewControl: boolean;
    fullscreenControl: boolean;
  }) => GoogleMap;
  Marker: new (options: {
    map: GoogleMap;
    position: { lat: number; lng: number };
    draggable: boolean;
  }) => GoogleMarker;
  Geocoder: new () => GoogleGeocoder;
  event: { addListener(target: GoogleMap, event: "click", listener: (event: { latLng?: LatLng }) => void): void };
}

interface GoogleMap {
  setCenter(position: { lat: number; lng: number }): void;
  setZoom(zoom: number): void;
}

interface GoogleMarker {
  setPosition(position: { lat: number; lng: number }): void;
}

interface GoogleGeocoder {
  geocode(request: { address: string; region: string } | { location: { lat: number; lng: number } }): Promise<{
    results: GeocodeResult[];
  }>;
}

interface GoogleMapsWindow extends Window {
  google?: { maps: GoogleMapsApi };
  initChocolateCircleMaps?: () => void;
}

interface AddressPickerOptions {
  root: HTMLElement;
  address: HTMLTextAreaElement;
  city: HTMLInputElement;
  state: HTMLInputElement;
  pincode: HTMLInputElement;
  map: HTMLElement;
  findButton: HTMLButtonElement;
  status: HTMLElement;
  onLocation?: (latitude: number, longitude: number) => void;
}

let mapsReady: Promise<GoogleMapsApi> | null = null;

function loadGoogleMaps(apiKey: string): Promise<GoogleMapsApi> {
  const browser = window as GoogleMapsWindow;
  if (browser.google?.maps) return Promise.resolve(browser.google.maps);
  if (mapsReady) return mapsReady;
  mapsReady = new Promise((resolve, reject) => {
    const callbackName = "initChocolateCircleMaps";
    let timeoutId: number | undefined;
    browser[callbackName] = () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      if (browser.google?.maps) resolve(browser.google.maps);
      else reject(new Error("Google Maps loaded without its map tools."));
      delete browser[callbackName];
    };
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&callback=${callbackName}&loading=async&v=weekly`;
    script.async = true;
    script.onerror = () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      mapsReady = null;
      delete browser[callbackName];
      reject(new Error("Could not load Google Maps. Check the map API key and connection."));
    };
    document.head.append(script);
    timeoutId = window.setTimeout(() => {
      mapsReady = null;
      delete browser[callbackName];
      script.remove();
      reject(new Error("Google Maps took too long to load. Please try again."));
    }, 15_000);
  });
  return mapsReady;
}

function component(result: GeocodeResult, type: string) {
  return result.address_components.find((entry) => entry.types.includes(type))?.long_name ?? "";
}

function getCity(result: GeocodeResult) {
  return component(result, "locality") ||
    component(result, "postal_town") ||
    component(result, "administrative_area_level_2") ||
    component(result, "sublocality_level_1");
}

export function initializeAddressPicker(options: AddressPickerOptions) {
  const apiKey = options.root.dataset.googleMapsKey?.trim() ?? "";
  options.findButton.addEventListener("click", async () => {
    const pincode = options.pincode.value.trim();
    if (!/^[1-9][0-9]{5}$/.test(pincode)) {
      options.status.textContent = "Enter a valid six-digit Indian PIN code first.";
      options.status.dataset.state = "error";
      options.pincode.focus();
      return;
    }
    if (!apiKey) {
      options.status.textContent = "The address map is not configured yet. Please contact the shop.";
      options.status.dataset.state = "error";
      return;
    }

    options.findButton.disabled = true;
    options.status.textContent = "Loading the map for your PIN code…";
    options.status.dataset.state = "success";
    try {
      const maps = await loadGoogleMaps(apiKey);
      const geocoder = new maps.Geocoder();
      const lookup = await geocoder.geocode({ address: `${pincode}, India`, region: "IN" });
      const result = lookup.results.find((entry) => component(entry, "country") === "India");
      if (!result) throw new Error("We couldn’t find that PIN code. Check it and try again.");

      const position = {
        lat: result.geometry.location.lat(),
        lng: result.geometry.location.lng(),
      };
      options.map.hidden = false;
      const map = new maps.Map(options.map, {
        center: position,
        zoom: 15,
        clickableIcons: false,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      });
      const marker = new maps.Marker({ map, position, draggable: false });
      options.status.textContent = "Tap or click the map to select the exact delivery address.";
      maps.event.addListener(map, "click", ({ latLng }) => {
        if (!latLng) return;
        marker.setPosition({ lat: latLng.lat(), lng: latLng.lng() });
        void geocoder.geocode({ location: { lat: latLng.lat(), lng: latLng.lng() } })
          .then(({ results }) => {
            const selected = results.find((entry) => component(entry, "country") === "India");
            if (!selected) throw new Error("Choose a location in India.");
            const selectedPincode = component(selected, "postal_code");
            if (selectedPincode && selectedPincode !== pincode) {
              throw new Error(`Choose an address in PIN code ${pincode}.`);
            }
            const city = getCity(selected);
            const state = component(selected, "administrative_area_level_1");
            if (!city || !state || !selectedPincode) {
              throw new Error("Google Maps couldn’t identify the city, state, or PIN code for this point. Choose a nearby address.");
            }
            const streetTypes = [
              "street_number",
              "route",
              "premise",
              "subpremise",
              "neighborhood",
              "sublocality_level_1",
              "sublocality_level_2",
              "sublocality",
            ];
            const streetAddress = selected.address_components
              .filter((entry) => entry.types.some((type) => streetTypes.includes(type)))
              .map((entry) => entry.long_name)
              .join(", ") ||
              selected.formatted_address.split(", ")
                .filter((part) => ![city, state, selectedPincode, "India"].includes(part.trim()))
                .join(", ");
            if (!streetAddress) {
              throw new Error("Google Maps couldn’t identify a street address for that point. Choose another map point.");
            }
            options.address.value = streetAddress.slice(0, 250);
            options.city.value = city.slice(0, 40);
            options.state.value = state.slice(0, 40);
            options.pincode.value = selectedPincode;
            options.onLocation?.(latLng.lat(), latLng.lng());
            options.status.textContent = "Delivery address selected. Check the address and location details.";
            options.status.dataset.state = "success";
          })
          .catch((error: unknown) => {
            options.status.textContent = error instanceof Error
              ? error.message
              : "Could not read the selected address. Choose another map point.";
            options.status.dataset.state = "error";
          });
      });
    } catch (error) {
      options.status.textContent = error instanceof Error ? error.message : "Could not find that PIN code.";
      options.status.dataset.state = "error";
    } finally {
      options.findButton.disabled = false;
    }
  });
}
