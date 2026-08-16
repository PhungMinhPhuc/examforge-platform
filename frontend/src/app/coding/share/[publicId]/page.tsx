"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";

export default function SharedCodingPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = use(params);
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [assignment, setAssignment] = useState<any>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api
      .resolvePublicCodingAssignment(publicId)
      .then(setAssignment)
      .catch((e: Error) => setError(e.message));
  }, [publicId]);
  useEffect(() => {
    if (assignment?.allow_link_access && user)
      router.replace(`/coding/${assignment.id}`);
  }, [assignment, user, router]);
  if (error)
    return (
      <div
        style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}
      >
        <div className="alert alert-error">{error}</div>
      </div>
    );
  if (isLoading || !assignment)
    return (
      <div
        style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}
      >
        <span className="spinner" />
      </div>
    );
  if (!assignment.allow_link_access)
    return (
      <div
        style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}
      >
        <div className="alert alert-error">Liên kết đã bị tắt</div>
      </div>
    );
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <div className="card" style={{ maxWidth: 480 }}>
        <h1>{assignment.title}</h1>
        <p style={{ margin: "1rem 0" }}>
          Bài lập trình yêu cầu đăng nhập để kiểm soát số lượt nộp.
        </p>
        <a
          className="btn btn-primary"
          href={`/?returnTo=${encodeURIComponent(`/coding/share/${publicId}`)}`}
        >
          Đăng nhập để tiếp tục
        </a>
      </div>
    </div>
  );
}
