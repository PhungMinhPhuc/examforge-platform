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
  const startingSeconds = initialSeconds ?? totalSeconds;
  const deadlineRef = useRef(Date.now() + startingSeconds * 1000);
  const [remaining, setRemaining] = useState(startingSeconds);
  const expiredRef = useRef(false);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  // Thời gian hiển thị luôn được suy ra từ deadline đã nhận từ backend. Không
  // trừ dần một biến ở frontend, vì render/lưu đáp án có thể làm interval trễ.
  useEffect(() => {
    const syncWithDeadline = () => {
      const nextRemaining = Math.max(
        0,
        Math.ceil((deadlineRef.current - Date.now()) / 1000),
      );
      setRemaining((current) =>
        current === nextRemaining ? current : nextRemaining,
      );
    };

    syncWithDeadline();
    const interval = setInterval(() => {
      syncWithDeadline();
    }, 250);
    return () => clearInterval(interval);
  }, []);

  // Báo hết giờ đúng một lần, sau khi render xong.
  useEffect(() => {
    if (remaining <= 0 && !expiredRef.current) {
      expiredRef.current = true;
      onExpireRef.current?.();
    }
  }, [remaining]);

  const mins = Math.floor(remaining / 60)
    .toString()
    .padStart(2, "0");
  const secs = (remaining % 60).toString().padStart(2, "0");
  const timerClass =
    remaining < 60 ? "danger" : remaining < 300 ? "warning" : "";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <div className={`exam-timer ${timerClass}`}>
        {mins}:{secs}
      </div>
    </div>
  );
}
