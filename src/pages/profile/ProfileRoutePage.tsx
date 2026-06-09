import { useParams } from '@tanstack/react-router'
import { ProfilePage } from '@/pages/profile/ProfilePage'

export function ProfileRoutePage() {
  const { username } = useParams({ from: '/u/$username' })
  return <ProfilePage username={username} />
}
