import type { TempestObsArray } from './columns.js';

const BASE = 'https://swd.weatherflow.com/swd/rest';

function token(): string {
  const t = process.env.WEATHERFLOW_TOKEN;
  if (!t) throw new Error('WEATHERFLOW_TOKEN is not set.');
  return t;
}

function stationId(): number {
  const raw = process.env.WEATHERFLOW_STATION_ID;
  if (!raw) throw new Error('WEATHERFLOW_STATION_ID is not set.');
  return Number(raw);
}

interface StationResponse {
  stations: {
    station_id: number;
    name: string;
    devices: { device_id: number; device_type: string }[];
  }[];
}

interface DeviceObsResponse {
  status: { status_code: number; status_message: string };
  obs: TempestObsArray[] | null;
}

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Tempest API ${res.status} ${res.statusText} for ${url}`);
  }
  return (await res.json()) as T;
}

let cachedOutdoorDeviceId: number | null = null;

export async function getOutdoorDeviceId(): Promise<number> {
  if (cachedOutdoorDeviceId !== null) return cachedOutdoorDeviceId;
  const data = await getJSON<StationResponse>(
    `${BASE}/stations/${stationId()}?token=${token()}`,
  );
  const station = data.stations[0];
  if (!station) throw new Error(`Station ${stationId()} not found.`);
  const outdoor = station.devices.find((d) => d.device_type === 'ST');
  if (!outdoor) throw new Error(`No outdoor (ST) device on station ${stationId()}.`);
  cachedOutdoorDeviceId = outdoor.device_id;
  return outdoor.device_id;
}

// Fetch device observations between two epochs (seconds).
// Tempest accepts windows up to ~7 days. For longer ranges the caller chunks.
export async function fetchObsRange(
  deviceId: number,
  startEpoch: number,
  endEpoch: number,
): Promise<TempestObsArray[]> {
  const url =
    `${BASE}/observations/device/${deviceId}` +
    `?time_start=${startEpoch}&time_end=${endEpoch}&token=${token()}`;
  const data = await getJSON<DeviceObsResponse>(url);
  return data.obs ?? [];
}
