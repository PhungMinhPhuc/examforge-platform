"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";
import type { CodingAssignment } from "@/modules/coding/types";
import CodingAssignmentForm from "@/modules/coding/CodingAssignmentForm";
import PageHeader from "@/components/PageHeader";
import useScrollRestoration from "@/lib/useScrollRestoration";
import DetailsMenu from "@/components/DetailsMenu";
import { Icon } from "@/components/icons";
import ViewModeToggle from "@/components/ViewModeToggle";
import { CollectionItem, CollectionView } from "@/components/CollectionView";
import useViewModePreference from "@/lib/useViewModePreference";

const STATUS_LABEL: Record<string, string> = {
  draft: "Bản nháp",
  published: "Đang mở",
  closed: "Đã đóng",
};

export default function CodingAssignmentsPage() {
  const [viewMode, setViewMode] = useViewModePreference("coding-view", "list");
  const { user } = useAuth();
  const [items, setItems] = useState<CodingAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const load = () =>
    api
      .getCodingAssignments()
      .then(setItems)
      .finally(() => setLoading(false));
  useEffect(() => {
    if (user) load();
  }, [user]);

  useScrollRestoration(!loading);

  const updateStatus = async (id: number, status: string) => {
    await api.updateCodingAssignmentStatus(id, status);
    load();
  };

  return (
    <div className="page-wrapper">
      <Sidebar />
      <main className="main-content">
        <PageHeader
          title="Đề thi và bài tập"
          description="Bài tập lập trình không giới hạn thời gian làm bài"
          actions={<div className="ui-collection-controls">
            <ViewModeToggle value={viewMode} onChange={setViewMode} ariaLabel="Chế độ hiển thị bài lập trình" />
            {user?.role === "teacher" && (
            <DetailsMenu style={{ position: "relative" }}>
              <summary
                className="ui-button ui-button--primary"
                style={{ listStyle: "none", cursor: "pointer" }}
              >
                <Icon name="plus" />
                Tạo mới
              </summary>
              <div
                className="card"
                style={{
                  position: "absolute",
                  right: 0,
                  top: "calc(100% + .4rem)",
                  width: 210,
                  zIndex: 30,
                  padding: ".4rem",
                  display: "grid",
                  gap: ".25rem",
                }}
              >
                <button
                  className="ui-button ui-button--ghost ui-button--small"
                  style={{ justifyContent: "flex-start" }}
                  onClick={() => setShowCreate(true)}
                >
                  <Icon name="plus" />
                  Tạo bài/đề lập trình
                </button>
                <Link
                  className="ui-button ui-button--ghost ui-button--small"
                  style={{ justifyContent: "flex-start" }}
                  href="/questions/create?type=cd&returnTo=/coding"
                >
                  <Icon name="plus" />
                  Tạo câu lập trình
                </Link>
              </div>
            </DetailsMenu>
            )}
          </div>}
        />
        <nav className="ui-tablist" style={{ marginBottom: "1.25rem" }} role="tablist" aria-label="Loại đề thi">
          <Link href="/contests" className="ui-tab" role="tab" aria-selected="false">
            Đề thi
          </Link>
          <Link href="/coding" className="ui-tab" role="tab" aria-selected="true">
            Lập trình
          </Link>
        </nav>
        {user?.role === "teacher" && showCreate && (
          <CodingAssignmentForm
            onCancel={() => setShowCreate(false)}
            onCreated={() => {
              setShowCreate(false);
              load();
            }}
          />
        )}
        {loading ? (
          <div className="ui-skeleton" style={{ height: 120 }} />
        ) : items.length === 0 ? (
          <div className="empty-state">
            <h3>Chưa có bài tập lập trình</h3>
          </div>
        ) : (
          <CollectionView items={items} mode={viewMode} getKey={(item) => item.id} ariaLabel="Danh sách bài lập trình" renderItem={(item) => (
            <CollectionItem
              href={`/coding/${item.id}`}
              badges={<><span className="badge badge-mode">{item.time_limit ? "Có tính giờ" : "Bài tập"}</span><span className={`badge ${item.status === "published" ? "badge-active" : "badge-inactive"}`}>{STATUS_LABEL[item.status]}</span></>}
              title={<Link href={`/coding/${item.id}`}>{item.title}</Link>}
              metadata={<><span>{item.time_limit ? `${item.time_limit} phút` : "Không giới hạn thời gian"}</span><span>{item.question_count || 0} bài</span>{item.class_name && <span>{item.class_name}</span>}{item.due_at && <span>Hạn {new Date(item.due_at).toLocaleString("vi-VN")}</span>}</>}
              actions={<><Link className={`ui-button ${user?.role === "teacher" ? "ui-button--secondary" : "ui-button--primary"} ui-button--small`} href={`/coding/${item.id}`}>{user?.role === "teacher" ? "Chi tiết" : "Làm bài"}</Link>{user?.role === "teacher" && (
                    <DetailsMenu className="ui-dropdown-anchor">
                      <summary
                        className="ui-dropdown__trigger ui-button ui-button--secondary ui-button--icon ui-button--small"
                        aria-label="Mở menu thao tác"
                      >
                        <Icon name="more-horizontal" />
                      </summary>
                      <div
                        className="card"
                        style={{
                          position: "absolute",
                          right: 0,
                          top: "calc(100% + .4rem)",
                          zIndex: 20,
                          width: 160,
                          padding: ".4rem",
                        }}
                      >
                        {item.status !== "published" ? (
                          <button
                            className="ui-button ui-button--ghost ui-button--small"
                            style={{
                              width: "100%",
                              justifyContent: "flex-start",
                            }}
                            onClick={() => updateStatus(item.id, "published")}
                          >
                            Mở bài
                          </button>
                        ) : (
                          <button
                            className="ui-button ui-button--ghost ui-button--small"
                            style={{
                              width: "100%",
                              justifyContent: "flex-start",
                            }}
                            onClick={() => updateStatus(item.id, "closed")}
                          >
                            Đóng bài
                          </button>
                        )}
                      </div>
                    </DetailsMenu>
                  )}</>}
            />
          )} />
        )}
      </main>
    </div>
  );
}
