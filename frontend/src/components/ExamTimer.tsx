"use client";
import { useEffect, useRef, useState } from "react";

interface Props {
  totalSeconds: number;
  initialSeconds?: number;
  onExpire?: () => void;
}

export default function ExamTimer({
  totalSeconds,
  initialSeconds,
  onExpire,
}: Props) {
  const [remaining, setRemaining] = useState(initialSeconds ?? totalSeconds);
  const expiredRef = useRef(false);

  // Đếm ngược: chỉ giảm thời gian, không gọi callback trong updater (tránh setState
  // khi đang render component khác).
  useEffect(() => {
    if (remaining <= 0) return;
    const interval = setInterval(() => {
      setRemaining((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [remaining]);

  // Báo hết giờ đúng một lần, sau khi render xong.
  useEffect(() => {
    if (remaining <= 0 && !expiredRef.current) {
      expiredRef.current = true;
      onExpire?.();
    }
  }, [remaining, onExpire]);

  const mins = Math.floor(remaining / 60)
    .toString()
    .padStart(2, "0");
  const secs = (remaining % 60).toString().padStart(2, "0");
  const pct = ((totalSeconds - remaining) / totalSeconds) * 100;

  const timerClass =
    remaining < 60 ? "danger" : remaining < 300 ? "warning" : "";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
        alignItems: "center",
      }}
    >
      <div className={`exam-timer ${timerClass}`}>
        <span></span>
        <span>
          {mins}:{secs}
        </span>
      </div>
      <div className="progress-bar" style={{ width: "140px" }}>
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
