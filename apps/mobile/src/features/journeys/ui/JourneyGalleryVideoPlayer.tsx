import { VideoView, useVideoPlayer } from 'expo-video'
import { StyleSheet } from 'react-native'

interface JourneyGalleryVideoPlayerProps {
  url: string
}

export function JourneyGalleryVideoPlayer({
  url,
}: JourneyGalleryVideoPlayerProps) {
  const player = useVideoPlayer(url, (instance) => {
    instance.play()
  })

  return (
    <VideoView
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
