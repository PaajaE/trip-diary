// Shared with the media-upload edge function (Deno); tested here and used by
// web/app clients to build requests.
export {
  completeMultipartXml,
  extensionFor,
  IMAGE_MAX_BYTES,
  IMAGE_VARIANT_KINDS,
  MULTIPART_PART_BYTES,
  objectKey,
  objectUrl,
  parseUploadIdXml,
  parseUploadRequest,
  partCount,
  publicUrl,
  r2Endpoint,
  VIDEO_MAX_BYTES,
  type ImageContentType,
  type ImageVariantKind,
  type UploadContentType,
  type UploadKind,
  type UploadRequest,
} from '../../../supabase/functions/_shared/media/upload.ts'
