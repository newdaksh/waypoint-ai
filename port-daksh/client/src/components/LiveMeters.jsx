import { useEffect, useRef } from 'react';
import { SparkIcon } from './icons.jsx';

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Calls `draw(level)` every animation frame with a smoothed copy of `read()` (0–1). It works on the DOM directly
 * instead of through React state, so a 60-per-second meter never re-renders the room.
 */
function useLevelLoop(read, draw) {
  const readRef = useRef(read);
  const drawRef = useRef(draw);
  useEffect(() => {
    readRef.current = read;
    drawRef.current = draw;
  });
  useEffect(() => {
    let raf = 0;
    let level = 0;
    const calm = reducedMotion();
    const frame = () => {
      const target = calm ? 0 : Math.min(1, readRef.current() * 6); // speech sits around 0.02–0.2 RMS
      level += (target - level) * (target > level ? 0.5 : 0.12); // quick attack, gentle release
      drawRef.current(level < 0.01 ? 0 : level);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
}

/** The interviewer's face. Rings swell with the voice; the state decides their colour (see live.css). */
export function Avatar({ name, speaker, paused, getLevel }) {
  const ref = useRef(null);
  useLevelLoop(getLevel, (level) => ref.current?.style.setProperty('--lvl', level.toFixed(3)));
  return (
    <div ref={ref} className="lv-avatar" data-speaker={paused ? 'paused' : speaker} aria-hidden="true">
      <i className="lv-avatar__ring lv-avatar__ring--3" />
      <i className="lv-avatar__ring lv-avatar__ring--2" />
      <i className="lv-avatar__ring lv-avatar__ring--1" />
      <span className="lv-avatar__face">{name ? name.slice(0, 1).toUpperCase() : <SparkIcon width={44} height={44} strokeWidth={1.5} />}</span>
    </div>
  );
}

const SEGMENTS = 18;

/** A row of segments that light up with the microphone level. */
export function MicMeter({ getLevel, live }) {
  const ref = useRef(null);
  useLevelLoop(getLevel, (level) => {
    const lit = Math.round(level * SEGMENTS);
    const kids = ref.current?.children;
    if (kids) for (let i = 0; i < kids.length; i += 1) kids[i].dataset.on = i < lit ? '1' : '0';
  });
  return (
    <div ref={ref} className="lv-meter" data-live={live ? '1' : '0'} aria-hidden="true">
      {Array.from({ length: SEGMENTS }, (_, i) => <i key={i} data-on="0" />)}
    </div>
  );
}
