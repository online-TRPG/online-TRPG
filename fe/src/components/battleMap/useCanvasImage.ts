import { useEffect, useState } from 'react';

export function useCanvasImage(src: string | null | undefined) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!src) {
      setImage(null);
      return;
    }

    let cancelled = false;
    const isCrossOrigin = (() => {
      try {
        return new URL(src, window.location.href).origin !== window.location.origin;
      } catch {
        return true;
      }
    })();

    const loadImage = (mode: 'anonymous' | 'default') => {
      const nextImage = new window.Image();
      if (mode === 'anonymous') {
        nextImage.crossOrigin = 'anonymous';
      }
      nextImage.onload = () => {
        if (!cancelled) {
          setImage(nextImage);
        }
      };
      nextImage.onerror = () => {
        if (cancelled) return;
        if (mode === 'anonymous') {
          loadImage('default');
          return;
        }
        setImage(null);
      };
      nextImage.src = src;
    };

    // R2 public URLs may omit CORS headers. Loading them anonymously makes the browser reject
    // otherwise displayable images, so only same-origin assets use anonymous mode by default.
    loadImage(isCrossOrigin ? 'default' : 'anonymous');

    return () => {
      cancelled = true;
    };
  }, [src]);

  return image;
}
