import { useEffect, useState } from 'react';

type ClockSubscriber = {
  notify: (now: number) => void;
  minIntervalMs: number;
  lastNotifiedAt: number;
};

const subscribers = new Set<ClockSubscriber>();
let animationFrame = 0;

function tick(now: number) {
  for (const subscriber of subscribers) {
    if (now - subscriber.lastNotifiedAt < subscriber.minIntervalMs) continue;
    subscriber.lastNotifiedAt = now;
    subscriber.notify(now);
  }
  animationFrame = subscribers.size ? window.requestAnimationFrame(tick) : 0;
}

function subscribe(subscriber: ClockSubscriber) {
  subscribers.add(subscriber);
  if (!animationFrame) {
    animationFrame = window.requestAnimationFrame(tick);
  }
  return () => {
    subscribers.delete(subscriber);
    if (!subscribers.size && animationFrame) {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    }
  };
}

export function useCombatAnimationClock(enabled: boolean, framesPerSecond = 60) {
  const [now, setNow] = useState(() => performance.now());

  useEffect(() => {
    if (!enabled) return;
    const subscriber: ClockSubscriber = {
      notify: setNow,
      minIntervalMs: 1_000 / Math.max(1, framesPerSecond),
      lastNotifiedAt: 0,
    };
    return subscribe(subscriber);
  }, [enabled, framesPerSecond]);

  return now;
}
