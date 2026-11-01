// A LiveKitRoom wrapper can remount the broadcaster's local <video> element
// without recreating the camera stream. Always attach the current MediaStream
// to the *new* video element; otherwise the camera is on but the preview is black.
export function attachLocalPreview(video, stream) {
  if (!video) return;
  if (video.srcObject !== stream) video.srcObject = stream;

  if (stream) {
    // Muted inline previews should autoplay, but explicitly resume on remount
    // (some browsers do not restart when srcObject changes).
    try {
      const attempt = video.play();
      if (attempt && typeof attempt.catch === 'function') {
        void attempt.catch(() => {});
      }
    } catch {
      // Autoplay permission errors must not break LiveKit publishing.
    }
  }
}
