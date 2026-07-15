export function shouldRequestDeviceLocation(input: {
  journeyMode: boolean
  propCenterAvailable: boolean
  useDeviceLocationFallback: boolean
}): boolean {
  return (
    input.useDeviceLocationFallback &&
    !input.journeyMode &&
    !input.propCenterAvailable
  )
}
