"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";

export default function SharedExamPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = use(params);
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .resolvePublicContest(publicId)
      .then((contest: any) => {
        if (!contest.allow_guest_link)
          throw new Error("Liên kết làm bài hiện đã bị tắt");
        router.replace(`/exam/${contest.id}?guest=true`);
      })
      .catch((e: Error) => setError(e.message));
  }, [publicId, router]);

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      {error ? (
        <div className="alert alert-error">{error}</div>
      ) : (
        <span className="spinner" />
      )}
    </div>
  );
}
