export type CodingAssignment = {
  id: number;
  public_id: string;
  title: string;
  description?: string | null;
  class_name?: string | null;
  assigned_class_ids?: number[];
  status: "draft" | "published" | "closed";
  due_at?: string | null;
  time_limit?: number | null;
  available_from?: string | null;
  allow_late_submission: boolean;
  allow_link_access?: boolean;
  question_count?: number;
  student_count?: number;
  progress_status?: string | null;
};

export type CodingQuestion = {
  id: number;
  content: any; // cây tài liệu (jsonb) — xem frontend/src/lib/docTree.ts
  subject?: string;
  grade?: number;
  chapter?: string;
  lesson?: string;
  complexity?: number;
  point_weight?: number;
  coding_details: {
    time_limit_c_cpp?: number;
    time_limit_java?: number;
    time_limit_python?: number;
    memory_limit?: number;
    max_submissions?: number;
  };
  coding_testcases?: Array<{
    id: number;
    input_data: string;
    output_data: string;
    is_public: boolean;
    is_sample?: boolean;
    description?: string;
  }>;
  submission_count?: number;
  best_score?: number | null;
  statuses?: string[];
};

export type CodingSubmission = {
  id: number;
  question_id: number;
  attempt_number: number;
  language: string;
  status: string;
  score?: number | null;
  runtime_ms?: number | null;
  memory_kb?: number | null;
  submitted_at: string;
  is_late?: boolean;
  source_code?: string;
  compiler_output?: string | null;
  student_name?: string;
  max_score?: number;
};

export type CodingTestcaseResult = {
  order_index: number;
  status: string;
  point_weight: number;
  is_public: boolean;
  hidden: boolean;
  runtime_ms?: number | null;
  memory_kb?: number | null;
  input_data?: string | null;
  expected_output?: string | null;
  actual_output?: string | null;
  error_message?: string | null;
};

export type CodingStudentProgress = {
  id: number;
  student_id: number;
  student_name: string;
  email: string;
  status: string;
  total_score: number;
  submission_count: number;
  last_submission_at?: string | null;
  has_late_submission?: boolean;
};
