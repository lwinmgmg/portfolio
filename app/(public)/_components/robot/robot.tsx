import type { Ref } from "react";

import type { RobotMood } from "@/app/(public)/_components/robot/robot-mood";
import styles from "@/app/(public)/_components/robot/robot.module.css";

export type RobotTheme = "light" | "dark";

type RobotProps = {
  mood: RobotMood;
  // Size and placement. The module sets no size, since its unlayered rules would beat Tailwind's.
  className?: string;
  // Forces a colour scheme instead of following the system one (the admin preview shows both).
  theme?: RobotTheme;
  // The reduced-motion view without the media query: nothing moves, the face still changes.
  still?: boolean;
  // The launcher's eye tracking sets its variables on the element.
  ref?: Ref<SVGSVGElement>;
};

// Every part is drawn once and the stylesheet picks what shows for `data-mood`, so a mood change
// is a cross-fade, not a remount. The viewBox is 100 × 100; part origins in the CSS use its units.
export function Robot({ mood, className, theme, still = false, ref }: RobotProps) {
  return (
    <svg
      ref={ref}
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 100 100"
      width={64}
      height={64}
      className={className ? `${styles.robot} ${className}` : styles.robot}
      data-mood={mood}
      data-theme={theme}
      data-still={still ? "" : undefined}
    >
      <ellipse className={styles.shadow} cx="50" cy="94" rx="22" ry="3.5" />
      <g className={styles.figure}>
        {/* Arms sit behind the body, so only their lower part shows. */}
        <rect className={`${styles.arm} ${styles.armLeft}`} x="27" y="66" width="7" height="17" rx="3.5" />
        <rect className={`${styles.arm} ${styles.armRight}`} x="66" y="66" width="7" height="17" rx="3.5" />
        <rect className={styles.shell} x="33" y="60" width="34" height="26" rx="9" />
        <circle className={styles.glowFill} cx="50" cy="74" r="3" />
        <g className={styles.head}>
          <line className={styles.line} x1="50" y1="22" x2="50" y2="13" />
          <g className={styles.bulb}>
            <circle className={styles.bulbDim} cx="50" cy="10" r="4.5" />
            <circle className={styles.bulbWarn} cx="50" cy="10" r="4.5" />
            <circle className={styles.bulbOn} cx="50" cy="10" r="4.5" />
          </g>
          <rect className={styles.shell} x="15" y="36" width="6" height="14" rx="3" />
          <rect className={styles.shell} x="79" y="36" width="6" height="14" rx="3" />
          <rect className={styles.shell} x="20" y="22" width="60" height="42" rx="14" />
          <rect className={styles.screen} x="27" y="29" width="46" height="28" rx="9" />
          <circle className={styles.cheek} cx="32" cy="50" r="3" />
          <circle className={styles.cheek} cx="68" cy="50" r="3" />
          <Eye cx={40} squint />
          <Eye cx={60} />
          <path className={styles.browsSad} d="M34 36 L44 33.5 M56 33.5 L66 36" />
          <path className={styles.browPuzzled} d="M55 34 Q60 30 65 33" />
          <g className={styles.mouth}>
            <path className={`${styles.stroke} ${styles.mouthIdle}`} d="M45 50 Q50 53.5 55 50" />
            <path className={`${styles.stroke} ${styles.mouthWaving}`} d="M43 49 Q50 55 57 49" />
            <path className={`${styles.stroke} ${styles.mouthListening}`} d="M47 51 L53 51" />
            <path className={`${styles.stroke} ${styles.mouthThinking}`} d="M46 51.5 L55 50" />
            <ellipse className={`${styles.glowFill} ${styles.mouthTalking}`} cx="50" cy="51" rx="4" ry="3" />
            <path className={`${styles.stroke} ${styles.mouthPuzzled}`} d="M44 51 Q47 49 50 51 T56 51" />
            <path className={`${styles.glowFill} ${styles.mouthHappy}`} d="M42 48.5 Q50 58 58 48.5 Z" />
            <path className={`${styles.stroke} ${styles.mouthSad}`} d="M45 53 Q50 49 55 53" />
          </g>
        </g>
        <g className={styles.question}>
          <text x="84" y="22" className={styles.questionMark}>
            ?
          </text>
        </g>
        <g className={styles.sparkles}>
          <path className={`${styles.glowFill} ${styles.sparkle}`} d={sparkle(12, 26)} />
          <path className={`${styles.glowFill} ${styles.sparkle}`} d={sparkle(88, 18)} />
        </g>
      </g>
    </svg>
  );
}

// `pupil` is what 5.3's eye tracking moves; each look for a mood sits inside it. Only the left
// eye squints (puzzled).
function Eye({ cx, squint = false }: { cx: number; squint?: boolean }) {
  return (
    <g className={squint ? `${styles.eye} ${styles.eyeLeft}` : styles.eye}>
      <g className={styles.pupil}>
        <g className={styles.eyeOpen}>
          <circle className={styles.glowFill} cx={cx} cy="42" r="5" />
          <circle className={styles.highlight} cx={cx + 1.8} cy="40.2" r="1.6" />
        </g>
        <path className={`${styles.stroke} ${styles.eyeHappy}`} d={`M${cx - 5} 44 Q${cx} 37 ${cx + 5} 44`} />
        {squint ? (
          <path className={`${styles.stroke} ${styles.eyeSquint}`} d={`M${cx - 5} 42 L${cx + 5} 42`} />
        ) : null}
      </g>
    </g>
  );
}

// A four-point star centred on (x, y).
function sparkle(x: number, y: number): string {
  return `M${x} ${y - 5} L${x + 1.3} ${y - 1.3} L${x + 5} ${y} L${x + 1.3} ${y + 1.3} L${x} ${y + 5} L${x - 1.3} ${y + 1.3} L${x - 5} ${y} L${x - 1.3} ${y - 1.3} Z`;
}
