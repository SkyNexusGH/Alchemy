/**
 * Runs in the page's own world. Keeps count of the camera, microphone and screen streams the
 * page has open, and says when that changes, so the tab can show a red dot while it records.
 * The stream itself is never touched or read.
 */
export function watchCapture(): void {
  const md = navigator.mediaDevices
  if (!md || !md.getUserMedia) return
  const live = new Set<MediaStreamTrack>()
  let was = false
  const report = (): void => {
    const now = [...live].some((t) => t.readyState === 'live')
    if (now === was) return
    was = now
    dispatchEvent(new Event(now ? '__alchemy_capture_on' : '__alchemy_capture_off'))
  }
  const track = (stream: MediaStream): MediaStream => {
    for (const t of stream.getTracks()) {
      live.add(t)
      t.addEventListener('ended', () => {
        live.delete(t)
        report()
      })
      const stop = t.stop.bind(t)
      t.stop = () => {
        stop()
        live.delete(t)
        report()
      }
    }
    report()
    return stream
  }
  const gum = md.getUserMedia.bind(md)
  md.getUserMedia = (c?: MediaStreamConstraints) => gum(c).then(track)
  if (md.getDisplayMedia) {
    const gdm = md.getDisplayMedia.bind(md)
    md.getDisplayMedia = (c?: DisplayMediaStreamOptions) => gdm(c).then(track)
  }
}
