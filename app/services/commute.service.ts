type Position = [number, number];
type ActivityPoint = [number, number];

type FeatureCollection = {
  type?: string;
  features?: Array<{
    geometry?: {
      type?: string;
      coordinates?: Position[][];
    };
  }>;
};

function readPolygon(environmentVariable: string): Position[] | null {
  const value = process.env[environmentVariable];
  if (!value) return null;

  let collection: FeatureCollection;
  try {
    collection = JSON.parse(value) as FeatureCollection;
  } catch {
    console.error(`[COMMUTE] Invalid GeoJSON in ${environmentVariable}`);
    return null;
  }

  if (collection.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
    return null;
  }

  const feature = collection.features.find(
    (item) => item.geometry?.type === "Polygon",
  );
  const ring = feature?.geometry?.coordinates?.[0];
  if (!Array.isArray(ring) || ring.length < 4) return null;

  const validRing = ring.every(
    (position) =>
      Array.isArray(position) &&
      Number.isFinite(position[0]) &&
      Number.isFinite(position[1]),
  );
  return validRing ? ring : null;
}

function readActivityPoint(value: unknown): ActivityPoint | null {
  if (
    !Array.isArray(value) ||
    value.length < 2 ||
    !Number.isFinite(value[0]) ||
    !Number.isFinite(value[1])
  ) {
    return null;
  }

  return [value[0], value[1]];
}

function containsPoint(
  [latitude, longitude]: ActivityPoint,
  ring: Position[],
): boolean {
  let inside = false;

  for (
    let current = 0, previous = ring.length - 1;
    current < ring.length;
    previous = current++
  ) {
    const [currentLongitude, currentLatitude] = ring[current];
    const [previousLongitude, previousLatitude] = ring[previous];
    const crossesLatitude =
      (currentLatitude > latitude) !== (previousLatitude > latitude);

    if (
      crossesLatitude &&
      longitude <
        ((previousLongitude - currentLongitude) *
          (latitude - currentLatitude)) /
          (previousLatitude - currentLatitude) +
          currentLongitude
    ) {
      inside = !inside;
    }
  }

  return inside;
}

export function isCommuteActivity(activity: {
  start_latlng?: unknown;
  end_latlng?: unknown;
}): boolean {
  const startPolygon = readPolygon("STRAVA_COMMUTE_START_GEOFENCE");
  const endPolygon = readPolygon("STRAVA_COMMUTE_END_GEOFENCE");
  const start = readActivityPoint(activity.start_latlng);
  const end = readActivityPoint(activity.end_latlng);

  if (!startPolygon || !endPolygon || !start || !end) return false;

  return (
    (containsPoint(start, startPolygon) && containsPoint(end, endPolygon)) ||
    (containsPoint(start, endPolygon) && containsPoint(end, startPolygon))
  );
}