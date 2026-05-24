const ENDPOINT = 'https://app.birdweather.com/graphql';

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string; path?: (string | number)[] }[];
}

export async function gql<T, V extends Record<string, unknown>>(
  query: string,
  variables: V,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = process.env.BIRDWEATHER_TOKEN;
  if (token) {
    // Optionnel : validé non requis pour la lecture publique le 2026-05-23.
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    throw new Error(`BirdWeather GraphQL HTTP ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as GraphQLResponse<T>;
  if (body.errors && body.errors.length > 0) {
    throw new Error(`BirdWeather GraphQL errors: ${JSON.stringify(body.errors)}`);
  }
  if (!body.data) {
    throw new Error('BirdWeather GraphQL: empty response.');
  }
  return body.data;
}

export function stationId(): string {
  const id = process.env.BIRDWEATHER_STATION_ID;
  if (!id) throw new Error('BIRDWEATHER_STATION_ID is not set.');
  return id;
}
