import React, { useEffect, useRef, useState } from "react";
import "./EffortSlider.css";

/**
 * The shared reasoning-effort lever, ported from the data wiki agent's control:
 * a "Faster <-> Smarter" stepped slider on a dotted pill track whose fill fades
 * light->dark up to a white puck, with the selected level named above it and
 * rolled in on change.
 *
 * Used by both Sentry's Think dropdown and the threat modeling wizard so the two
 * read the same. Levels run 1-4 — there is no "off": every current model is a
 * reasoning model, and on Claude Opus 5 thinking cannot be disabled above effort
 * "high" (see backend/threat_designer/constants.py).
 */

export const MIN_EFFORT = 1;
export const MAX_EFFORT = 4;

// "Extra" rather than "xhigh"/"Extra High": xhigh is the wire value the runtime
// expects but it reads badly in a UI. Label-only — never sent to the API.
export const EFFORT_LEVELS = [
  { value: 1, label: "Low" },
  { value: 2, label: "Medium" },
  { value: 3, label: "High" },
  { value: 4, label: "Extra" },
];

export const effortLabel = (value) =>
  EFFORT_LEVELS.find((level) => level.value === Number(value))?.label ?? "";

const clamp = (value) => {
  const n = Number(value);
  if (Number.isNaN(n)) return MIN_EFFORT;
  return Math.min(Math.max(Math.round(n), MIN_EFFORT), MAX_EFFORT);
};

/** The level name, rolling the old value out below as the new one drops in. */
function RollingLevel({ label }) {
  const prevRef = useRef(label);
  const [leaving, setLeaving] = useState(null);
  // Increments only on a real change, so the enter animation runs exactly then
  // and never on mount.
  const [gen, setGen] = useState(0);

  useEffect(() => {
    const prev = prevRef.current;
    if (prev === label) return undefined;
    prevRef.current = label;
    setLeaving(prev);
    setGen((g) => g + 1);
    const timer = setTimeout(() => setLeaving(null), 260);
    return () => clearTimeout(timer);
  }, [label]);

  return (
    <span className="effort-slider__level">
      <span
        key={gen}
        className={`effort-slider__level-in${gen === 0 ? " effort-slider__level-in--initial" : ""}`}
      >
        {label}
      </span>
      {leaving != null && (
        <span key={`out-${gen}`} aria-hidden="true" className="effort-slider__level-out">
          {leaving}
        </span>
      )}
    </span>
  );
}

const EffortSlider = ({ value, onChange, showHeader = true, readOnly = false }) => {
  const level = clamp(value);
  // Filled fraction 0..1 across the available stops.
  const frac = (level - MIN_EFFORT) / (MAX_EFFORT - MIN_EFFORT);

  return (
    <div
      className={`effort-slider${readOnly ? " effort-slider--readonly" : ""}`}
      style={{ "--effort-frac": frac || 0.0001 }}
    >
      {showHeader && (
        <div className="effort-slider__header">
          Effort <RollingLevel label={effortLabel(level)} />
        </div>
      )}
      <div className="effort-slider__ends">
        <span>Faster</span>
        <span>Smarter</span>
      </div>
      <div className="effort-slider__rail">
        <div className="effort-slider__track" />
        <div className="effort-slider__fill" />
        <div className="effort-slider__thumb" />
        <input
          className="effort-slider__input"
          type="range"
          min={MIN_EFFORT}
          max={MAX_EFFORT}
          step={1}
          value={level}
          disabled={readOnly}
          onChange={(event) => onChange?.(Number(event.target.value))}
          aria-label="Reasoning effort"
          aria-valuetext={effortLabel(level)}
        />
      </div>
    </div>
  );
};

export default React.memo(EffortSlider);
