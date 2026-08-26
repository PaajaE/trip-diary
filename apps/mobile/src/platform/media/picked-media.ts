import type { PickedMedia } from '@/platform/media/photo'
import type { PickedVideo } from '@/platform/media/video'

export function isPickedVideo(media: PickedMedia): media is PickedVideo {
  return media.mimeType === 'video/mp4'
}
