export type CodingAssignment = {
  id: number;
  public_id: string;
  title: string;
  description?: string | null;
  class_id?: number | null;
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
  content: string;
  subject?: string;
  grade?: number;
  chapter?: string;
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
    description?: string;
  }>;
  submission_count?: number;
  best_score?: number | null;
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
