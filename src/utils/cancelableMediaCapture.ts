/**
 * Owns the camera/microphone tracks created by a single getUserMedia call.
 * The browser can grant permission after a component has already unmounted;
 * late streams must be stopped immediately rather than handed to dead UI.
 */
export function createCancelableMediaCapture<
  TStream extends { getTracks(): { stop(): void }[] },
>(
  acquire: () => Promise<TStream>,
  onReady: (stream: TStream) => void,
  onError: (error: unknown) => void,
) {
  let disposed = false;
  let activeStream: TStream | null = null;

  return {
    async start(): Promise<void> {
      try {
        const stream = await acquire();
        if (disposed) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        activeStream = stream;
        onReady(stream);
      } catch (error) {
        if (!disposed) onError(error);
      }
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
        activeStream = null;
      }
    },
  };
}
