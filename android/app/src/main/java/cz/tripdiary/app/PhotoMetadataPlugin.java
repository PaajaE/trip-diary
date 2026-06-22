package cz.tripdiary.app;

import android.Manifest;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import androidx.exifinterface.media.ExifInterface;
import com.getcapacitor.FileUtils;
import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.UUID;

@CapacitorPlugin(
    name = "PhotoMetadata",
    permissions = {
        @Permission(
            strings = { Manifest.permission.ACCESS_MEDIA_LOCATION },
            alias = PhotoMetadataPlugin.PERMISSION_ACCESS_MEDIA_LOCATION
        )
    }
)
@SuppressWarnings("unused")
public class PhotoMetadataPlugin extends Plugin {

    public static final String PERMISSION_ACCESS_MEDIA_LOCATION = "accessMediaLocation";
    private static final String TAG = "PhotoMetadata";

    @PluginMethod
    public void requestMediaPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            call.resolve(createPermissionStatus(PermissionState.GRANTED));
            return;
        }

        if (getPermissionState(PERMISSION_ACCESS_MEDIA_LOCATION) == PermissionState.GRANTED) {
            call.resolve(createPermissionStatus(PermissionState.GRANTED));
            return;
        }

        requestPermissionForAlias(
            PERMISSION_ACCESS_MEDIA_LOCATION,
            call,
            "mediaPermissionsCallback"
        );
    }

    @PermissionCallback
    private void mediaPermissionsCallback(PluginCall call) {
        call.resolve(createPermissionStatus(getPermissionState(PERMISSION_ACCESS_MEDIA_LOCATION)));
    }

    @PluginMethod
    public void readGpsFromUri(PluginCall call) {
        String uriString = call.getString("uri");
        Logger.info(TAG, "readGpsFromUri " + uriString);
        if (uriString == null || uriString.isEmpty()) {
            call.reject("uri is required");
            return;
        }

        try {
            Uri uri = Uri.parse(uriString);
            call.resolve(readGpsMetadata(uri));
        } catch (Exception exception) {
            Logger.error(TAG, "readGpsFromUri failed", exception);
            call.reject(exception.getMessage() == null ? "Failed to read photo GPS" : exception.getMessage());
        }
    }

    @PluginMethod
    public void materializePhotoFromUri(PluginCall call) {
        String uriString = call.getString("uri");
        Logger.info(TAG, "materializePhotoFromUri " + uriString);
        if (uriString == null || uriString.isEmpty()) {
            call.reject("uri is required");
            return;
        }

        try {
            Uri uri = Uri.parse(uriString);
            String mimeType = getContext().getContentResolver().getType(uri);
            if (mimeType == null || mimeType.isEmpty()) {
                mimeType = "image/jpeg";
            }

            File cachedFile = copyUriToCache(uri, mimeType);
            ExifInterface cachedExif = new ExifInterface(cachedFile.getAbsolutePath());
            Uri cachedUri = Uri.fromFile(cachedFile);

            JSObject result = readGpsMetadata(uri);
            mergeExifMetadata(result, cachedExif);

            result.put("path", cachedFile.getAbsolutePath());
            result.put(
                "webPath",
                FileUtils.getPortablePath(getContext(), getBridge().getLocalUrl(), cachedUri)
            );
            result.put("mimeType", mimeType);

            Logger.info(
                TAG,
                "materializePhotoFromUri success path=" +
                cachedFile.getAbsolutePath() +
                " size=" +
                cachedFile.length()
            );
            call.resolve(result);
        } catch (Exception exception) {
            Logger.error(TAG, "materializePhotoFromUri failed", exception);
            call.reject(exception.getMessage() == null ? "Failed to load photo" : exception.getMessage());
        }
    }

    private JSObject createPermissionStatus(PermissionState state) {
        JSObject result = new JSObject();
        result.put(PERMISSION_ACCESS_MEDIA_LOCATION, state.toString());
        return result;
    }

    private File copyUriToCache(Uri uri, String mimeType) throws Exception {
        File cacheDir = new File(getContext().getCacheDir(), "picked-photos");
        if (!cacheDir.exists() && !cacheDir.mkdirs()) {
            throw new Exception("Could not create photo cache directory");
        }

        File outFile = new File(cacheDir, UUID.randomUUID() + extensionForMimeType(mimeType));

        try (InputStream input = openPickerImageStream(uri);
             FileOutputStream output = new FileOutputStream(outFile)) {
            if (input == null) {
                throw new Exception("Could not open selected photo");
            }

            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
            }
        }

        if (outFile.length() == 0L) {
            throw new Exception("Selected photo is empty");
        }

        return outFile;
    }

    private JSObject readGpsMetadata(Uri uri) throws Exception {
        ExifInterface exif = readExifFromUri(uri);
        if (exif == null) {
            return new JSObject();
        }
        return buildGpsResult(exif);
    }

    private void mergeExifMetadata(JSObject result, ExifInterface exif) {
        JSObject cachedGps = buildGpsResult(exif);
        if (!result.has("latitude") && cachedGps.has("latitude")) {
            result.put("latitude", cachedGps.optDouble("latitude"));
        }
        if (!result.has("longitude") && cachedGps.has("longitude")) {
            result.put("longitude", cachedGps.optDouble("longitude"));
        }

        String capturedAt = readCapturedAt(exif);
        if (capturedAt != null) {
            result.put("capturedAt", capturedAt);
        }
    }

    private ExifInterface readExifFromUri(Uri uri) throws Exception {
        ExifInterface cachedExif = readExifFromStream(openPickerImageStream(uri));
        if (cachedExif != null && hasGps(cachedExif)) {
            return cachedExif;
        }

        ExifInterface originalExif = readExifFromStream(openOriginalMetadataStream(uri));
        if (originalExif != null) {
            return originalExif;
        }

        return cachedExif;
    }

    private ExifInterface readExifFromStream(InputStream stream) throws Exception {
        if (stream == null) {
            return null;
        }

        try (InputStream input = stream) {
            return new ExifInterface(input);
        }
    }

    private boolean hasGps(ExifInterface exif) {
        float[] latLong = new float[2];
        if (exif.getLatLong(latLong)) {
            return true;
        }

        String latitude = exif.getAttribute(ExifInterface.TAG_GPS_LATITUDE);
        String longitude = exif.getAttribute(ExifInterface.TAG_GPS_LONGITUDE);
        return latitude != null && !latitude.isEmpty() && longitude != null && !longitude.isEmpty();
    }

    private JSObject buildGpsResult(ExifInterface exif) {
        JSObject result = new JSObject();

        float[] latLong = new float[2];
        if (exif.getLatLong(latLong)) {
            result.put("latitude", latLong[0]);
            result.put("longitude", latLong[1]);
            return result;
        }

        Double latitude = readCoordinate(exif, ExifInterface.TAG_GPS_LATITUDE, ExifInterface.TAG_GPS_LATITUDE_REF);
        Double longitude = readCoordinate(exif, ExifInterface.TAG_GPS_LONGITUDE, ExifInterface.TAG_GPS_LONGITUDE_REF);
        if (latitude != null) {
            result.put("latitude", latitude);
        }
        if (longitude != null) {
            result.put("longitude", longitude);
        }

        return result;
    }

    private String readCapturedAt(ExifInterface exif) {
        String value = exif.getAttribute(ExifInterface.TAG_DATETIME_ORIGINAL);
        if (value == null || value.isEmpty()) {
            value = exif.getAttribute(ExifInterface.TAG_DATETIME);
        }
        if (value == null || value.isEmpty()) {
            return null;
        }

        try {
            SimpleDateFormat parser = new SimpleDateFormat("yyyy:MM:dd HH:mm:ss", Locale.US);
            parser.setTimeZone(TimeZone.getDefault());
            Date parsed = parser.parse(value);
            if (parsed == null) {
                return null;
            }
            SimpleDateFormat formatter = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", Locale.US);
            formatter.setTimeZone(TimeZone.getDefault());
            return formatter.format(parsed);
        } catch (Exception ignored) {
            return null;
        }
    }

    private String extensionForMimeType(String mimeType) {
        if ("image/png".equalsIgnoreCase(mimeType)) {
            return ".png";
        }
        if ("image/webp".equalsIgnoreCase(mimeType)) {
            return ".webp";
        }
        if ("image/heic".equalsIgnoreCase(mimeType) || "image/heif".equalsIgnoreCase(mimeType)) {
            return ".heic";
        }
        return ".jpg";
    }

    private InputStream openPickerImageStream(Uri uri) throws Exception {
        if ("file".equals(uri.getScheme())) {
            String path = uri.getPath();
            if (path == null) {
                return null;
            }
            return new FileInputStream(path);
        }

        return getContext().getContentResolver().openInputStream(uri);
    }

    private InputStream openOriginalMetadataStream(Uri uri) throws Exception {
        if (!"content".equals(uri.getScheme())) {
            return openPickerImageStream(uri);
        }

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            return openPickerImageStream(uri);
        }

        String authority = uri.getAuthority() == null ? "" : uri.getAuthority();
        if (authority.contains("photos.contentprovider")) {
            Logger.info(TAG, "Skipping setRequireOriginal for Google Photos provider URI");
            return openPickerImageStream(uri);
        }

        if (getPermissionState(PERMISSION_ACCESS_MEDIA_LOCATION) != PermissionState.GRANTED) {
            Logger.info(TAG, "ACCESS_MEDIA_LOCATION not granted, using picker URI stream");
            return openPickerImageStream(uri);
        }

        try {
            Uri originalUri = MediaStore.setRequireOriginal(uri);
            InputStream stream = getContext().getContentResolver().openInputStream(originalUri);
            if (stream != null) {
                return stream;
            }
        } catch (Exception exception) {
            Logger.warn(
                TAG,
                "setRequireOriginal failed, using picker URI stream: " + exception.getMessage()
            );
        }

        return openPickerImageStream(uri);
    }

    private Double readCoordinate(ExifInterface exif, String valueTag, String referenceTag) {
        String value = exif.getAttribute(valueTag);
        String reference = exif.getAttribute(referenceTag);
        if (value == null || value.isEmpty()) {
            return null;
        }

        String[] parts = value.split(",");
        if (parts.length < 3) {
            return null;
        }

        double degrees = parseRational(parts[0]);
        double minutes = parseRational(parts[1]);
        double seconds = parseRational(parts[2]);
        if (Double.isNaN(degrees) || Double.isNaN(minutes) || Double.isNaN(seconds)) {
            return null;
        }

        double decimal = Math.abs(degrees) + (minutes / 60d) + (seconds / 3600d);
        if ("S".equalsIgnoreCase(reference) || "W".equalsIgnoreCase(reference)) {
            decimal = -Math.abs(decimal);
        }

        return decimal;
    }

    private double parseRational(String value) {
        String trimmed = value.trim();
        if (trimmed.contains("/")) {
            String[] parts = trimmed.split("/");
            if (parts.length != 2) {
                return Double.NaN;
            }
            double numerator = Double.parseDouble(parts[0]);
            double denominator = Double.parseDouble(parts[1]);
            if (denominator == 0d) {
                return Double.NaN;
            }
            return numerator / denominator;
        }

        return Double.parseDouble(trimmed);
    }
}
