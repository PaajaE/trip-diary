import { VideoView, useVideoPlayer, type VideoViewProps } from 'expo-video'
import { type ComponentType } from 'react'
import { StyleSheet } from 'react-native'

interface JourneyGalleryVideoPlayerProps {
  url: string
}

const GalleryVideoView = VideoView as unknown as ComponentType<VideoViewProps>

export function JourneyGalleryVideoPlayer({
  url,
}: JourneyGalleryVideoPlayerProps) {
  const player = useVideoPlayer(url, (instance) => {
    instance.play()
  })

  return (
    <GalleryVideoView
      allowsFullscreen
      contentFit="contain"
      nativeControls
      player={player}
      style={styles.videoPlayer}
    />
  )
}

const styles = StyleSheet.create({
  videoPlayer: {
    aspectRatio: 16 / 9,
    backgroundColor: '#000000',
    borderRadius: 8,
    width: '100%',
  },
})
