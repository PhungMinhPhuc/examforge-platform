import styles from "./ShortAnswerDisplay.module.css";

type ShortAnswerTone = "primary" | "correct" | "incorrect";

type ShortAnswerDisplayProps = {
  value?: unknown;
  label?: string;
  minBoxes?: number;
  tone?: ShortAnswerTone;
  alignLabel?: boolean;
  className?: string;
};

function normalizeAnswer(value: unknown) {
  return String(value ?? "")
    .replace(/\$/g, "")
    .replace(/[{}]/g, "")
    .trim();
}

export default function ShortAnswerDisplay({
  value,
  label = "Trả lời ngắn:",
  minBoxes = 4,
  tone = "primary",
  alignLabel = false,
  className = "",
}: ShortAnswerDisplayProps) {
  const characters = Array.from(normalizeAnswer(value));
  const boxes = Array.from(
    { length: Math.max(minBoxes, characters.length) },
    (_, index) => characters[index] || "",
  );
  const toneClass = tone === "primary" ? "" : styles[tone];
  const labelClass = alignLabel ? styles.alignedLabel : "";

  return (
    <div
      className={[styles.display, toneClass, className]
        .filter(Boolean)
        .join(" ")}
    >
      <span className={[styles.label, labelClass].filter(Boolean).join(" ")}>
        {label}
      </span>
      <span className={styles.boxes} aria-label={normalizeAnswer(value)}>
        {boxes.map((character, index) => (
          <span className={styles.box} key={index} aria-hidden="true">
            {character}
          </span>
        ))}
      </span>
    </div>
  );
}
