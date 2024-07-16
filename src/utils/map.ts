//url: `https://api.mapy.cz/v1/maptiles/basic/256/{z}/{x}/{y}?apikey=${import.meta.env.VITE_APP_MAPY_CZ_KEY}`


/**
 * Converts a coordinate string from "longitude, latitude" to a PostGIS Geography Point.
 * @param {string} coordinateStr - The coordinate string "longitude, latitude".
 * @returns {string} A PostGIS Geography Point formatted as WKT (Well-Known Text).
 */
export function formatGeographyPoint(coordinateStr: string): string {
  const parts = coordinateStr.split(',').map(part => part.trim());
  if (parts.length !== 2) {
      throw new Error('Invalid coordinate format. Expected format: "longitude, latitude".');
  }
  return `POINT(${parts[0]} ${parts[1]})`;
}

/**
 * Parses a geographical point in WKT (Well-Known Text) format to extract the latitude and longitude.
 * This function expects the input to be a string in the format 'POINT(lon lat)' and returns an object
 * with properties `lat` and `long`, both of which are numbers. If the format is incorrect, it throws an error.
 *
 * @param {string} point - The point in 'POINT(lon lat)' format.
 * @returns {{ lat: number; long: number }} Returns an object containing the latitude and longitude.
 * @throws {Error} Throws an error if the input string format does not match the expected POINT format.
 */
export function parsePoint(point: string): { lat: number; long: number } {
  const match = point.match(/POINT\s*\(\s*(?<long>[-+]?[0-9]*\.?[0-9]+)\s+(?<lat>[-+]?[0-9]*\.?[0-9]+)\s*\)/);
  if (!match || !match.groups) {
    throw new Error("Invalid point format");
  }
  return {
    lat: parseFloat(match.groups.lat),
    long: parseFloat(match.groups.long)
  };
}
