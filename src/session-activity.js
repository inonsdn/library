export function shouldTouchSession({
  now,
  lastInteraction,
  lastTouch,
  hidden,
}) {
  return (
    !hidden && now - lastInteraction <= 120000 && now - lastTouch >= 300000
  );
}
