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

/**
 * Parses a GPX file (either as text/xml, application/octet-stream, or without a type) and converts it into a PostGIS-compatible WKT LINESTRING.
 * @param {File} file - The GPX file to be parsed.
 * @returns {Promise<string | null>} - The WKT LINESTRING string or null if parsing fails.
 */
export async function convertGpxFileToWkt(file: File): Promise<string | null> {
  try {
    let gpxText: string;

    // If file type is empty, we need to read and analyze the file content
    if (!file.type || file.type === "") {
      // Read the first few bytes of the file to check for XML content
      const arrayBuffer = await file.slice(0, 200).arrayBuffer();
      const textSnippet = new TextDecoder().decode(arrayBuffer);

      // If the content looks like XML, we treat it as a GPX file
      if (textSnippet.includes("<gpx") && textSnippet.includes("<?xml")) {
        gpxText = await file.text();
      } else {
        console.error("Unsupported file content. Expected a GPX XML file.");
        return null;
      }
    } else if (file.type === "application/xml" || file.type === "text/xml") {
      // If the file is an XML file, read it as text directly
      gpxText = await file.text();
    } else if (file.type === "application/octet-stream") {
      // If the file is a binary GPX file, read it as an ArrayBuffer and decode it
      const gpxBuffer = await file.arrayBuffer();
      gpxText = new TextDecoder().decode(gpxBuffer);
    } else {
      console.error("Unsupported file type.");
      return null;
    }

    // Parse the GPX XML string
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(gpxText, "application/xml");

    // Extract track points (trkpt) from the GPX file
    const trackPoints = Array.from(xmlDoc.getElementsByTagName("trkpt"));

    if (trackPoints.length === 0) {
      console.error("No track points found in the GPX file.");
      return null;
    }

    // Convert track points to coordinates (longitude and latitude)
    const coordinates = trackPoints
      .map((point) => {
        const lat = point.getAttribute("lat");
        const lon = point.getAttribute("lon");

        if (lat && lon) {
          return `${lon} ${lat}`; // Longitude first, then latitude (WKT standard)
        } else {
          return null;
        }
      })
      .filter((coord): coord is string => coord !== null) // Filter out any null values
      .join(", ");

    if (coordinates.length === 0) {
      console.error("No valid coordinates found in the GPX file.");
      return null;
    }

    // Return the WKT LINESTRING
    return `LINESTRING(${coordinates})`;
  } catch (error) {
    console.error("Failed to parse GPX file:", error);
    return null;
  }
}
