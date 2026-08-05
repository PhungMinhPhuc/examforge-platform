--
-- PostgreSQL database dump
--

\restrict kZc0G4ajxcDRdtcvJXfAMFQSVc93upn4TBgBao58FtrwFjafuQYUK3jW7dhktIn

-- Dumped from database version 18.3
-- Dumped by pg_dump version 18.3

-- Started on 2026-08-05 15:04:25

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 219 (class 1259 OID 124456)
-- Name: accounts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.accounts (
    id bigint NOT NULL,
    public_id uuid DEFAULT gen_random_uuid(),
    email character varying NOT NULL,
    password character varying NOT NULL,
    is_active boolean DEFAULT true,
    role character varying NOT NULL,
    create_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    name character varying,
    avatar_url character varying,
    CONSTRAINT check_valid_role CHECK (((role)::text = ANY (ARRAY[('student'::character varying)::text, ('teacher'::character varying)::text, ('admin'::character varying)::text])))
);


ALTER TABLE public.accounts OWNER TO postgres;

--
-- TOC entry 220 (class 1259 OID 124470)
-- Name: accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.accounts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.accounts_id_seq OWNER TO postgres;

--
-- TOC entry 5288 (class 0 OID 0)
-- Dependencies: 220
-- Name: accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.accounts_id_seq OWNED BY public.accounts.id;


--
-- TOC entry 255 (class 1259 OID 239669)
-- Name: class_coding_assignments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.class_coding_assignments (
    class_id bigint NOT NULL,
    assignment_id bigint NOT NULL,
    assigned_by bigint,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.class_coding_assignments OWNER TO postgres;

--
-- TOC entry 254 (class 1259 OID 239645)
-- Name: class_contests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.class_contests (
    class_id bigint NOT NULL,
    contest_id bigint NOT NULL,
    assigned_by bigint,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.class_contests OWNER TO postgres;

--
-- TOC entry 221 (class 1259 OID 124471)
-- Name: classes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.classes (
    id bigint NOT NULL,
    teacher_id bigint,
    public_id uuid DEFAULT gen_random_uuid(),
    class_name text NOT NULL,
    description text,
    create_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    student_count integer DEFAULT 0,
    contest_count integer DEFAULT 0
);


ALTER TABLE public.classes OWNER TO postgres;

--
-- TOC entry 222 (class 1259 OID 124480)
-- Name: classes_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.classes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.classes_id_seq OWNER TO postgres;

--
-- TOC entry 5289 (class 0 OID 0)
-- Dependencies: 222
-- Name: classes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.classes_id_seq OWNED BY public.classes.id;


--
-- TOC entry 251 (class 1259 OID 239586)
-- Name: coding_assignment_questions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.coding_assignment_questions (
    assignment_id bigint NOT NULL,
    question_id bigint NOT NULL,
    order_index integer DEFAULT 0 NOT NULL,
    point_weight numeric(8,2) DEFAULT 1 NOT NULL,
    max_submissions_override integer,
    CONSTRAINT coding_assignment_questions_max_submissions_override_check CHECK (((max_submissions_override IS NULL) OR (max_submissions_override > 0))),
    CONSTRAINT coding_assignment_questions_point_weight_check CHECK ((point_weight >= (0)::numeric))
);


ALTER TABLE public.coding_assignment_questions OWNER TO postgres;

--
-- TOC entry 253 (class 1259 OID 239610)
-- Name: coding_assignment_students; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.coding_assignment_students (
    id bigint NOT NULL,
    assignment_id bigint NOT NULL,
    student_id bigint NOT NULL,
    started_at timestamp without time zone,
    last_activity_at timestamp without time zone,
    completed_at timestamp without time zone,
    status character varying(20) DEFAULT 'not_started'::character varying NOT NULL,
    total_score numeric(10,2) DEFAULT 0 NOT NULL,
    CONSTRAINT coding_assignment_students_status_check CHECK (((status)::text = ANY ((ARRAY['not_started'::character varying, 'in_progress'::character varying, 'completed'::character varying])::text[])))
);


ALTER TABLE public.coding_assignment_students OWNER TO postgres;

--
-- TOC entry 252 (class 1259 OID 239609)
-- Name: coding_assignment_students_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.coding_assignment_students ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.coding_assignment_students_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 250 (class 1259 OID 239545)
-- Name: coding_assignments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.coding_assignments (
    id bigint NOT NULL,
    class_id bigint,
    teacher_id bigint NOT NULL,
    public_id uuid DEFAULT gen_random_uuid() NOT NULL,
    legacy_contest_id bigint,
    title text NOT NULL,
    description text,
    available_from timestamp without time zone,
    due_at timestamp without time zone,
    status character varying(20) DEFAULT 'draft'::character varying NOT NULL,
    allow_late_submission boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    allow_link_access boolean DEFAULT false NOT NULL,
    time_limit integer,
    question_count integer DEFAULT 0 NOT NULL,
    student_count integer DEFAULT 0 NOT NULL,
    CONSTRAINT coding_assignments_check CHECK (((due_at IS NULL) OR (available_from IS NULL) OR (due_at >= available_from))),
    CONSTRAINT coding_assignments_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'published'::character varying, 'closed'::character varying])::text[]))),
    CONSTRAINT coding_assignments_time_limit_check CHECK (((time_limit IS NULL) OR (time_limit > 0)))
);


ALTER TABLE public.coding_assignments OWNER TO postgres;

--
-- TOC entry 249 (class 1259 OID 239544)
-- Name: coding_assignments_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.coding_assignments ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.coding_assignments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 257 (class 1259 OID 239702)
-- Name: coding_submission_testcase_results; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.coding_submission_testcase_results (
    id bigint NOT NULL,
    submission_id bigint NOT NULL,
    testcase_id bigint,
    order_index integer NOT NULL,
    input_data text,
    expected_output text,
    actual_output text,
    status character varying(50) DEFAULT 'Pending'::character varying NOT NULL,
    runtime_ms integer,
    memory_kb integer,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.coding_submission_testcase_results OWNER TO postgres;

--
-- TOC entry 256 (class 1259 OID 239701)
-- Name: coding_submission_testcase_results_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.coding_submission_testcase_results ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.coding_submission_testcase_results_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 223 (class 1259 OID 124481)
-- Name: contest_results; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.contest_results (
    id bigint NOT NULL,
    student_id bigint,
    contest_id bigint,
    start_time timestamp without time zone,
    end_time timestamp without time zone,
    total_score numeric,
    count_wrong_answers integer,
    display_order text,
    guest_name character varying
);


ALTER TABLE public.contest_results OWNER TO postgres;

--
-- TOC entry 224 (class 1259 OID 124487)
-- Name: contest_results_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.contest_results_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.contest_results_id_seq OWNER TO postgres;

--
-- TOC entry 5290 (class 0 OID 0)
-- Dependencies: 224
-- Name: contest_results_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.contest_results_id_seq OWNED BY public.contest_results.id;


--
-- TOC entry 225 (class 1259 OID 124488)
-- Name: contests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.contests (
    id bigint NOT NULL,
    class_id bigint,
    public_id uuid DEFAULT gen_random_uuid(),
    title text NOT NULL,
    time_limit integer NOT NULL,
    scoring_config jsonb,
    status character varying NOT NULL,
    teacher_id bigint,
    allow_guest_link boolean DEFAULT false NOT NULL,
    available_from timestamp without time zone,
    due_at timestamp without time zone,
    allow_late_submission boolean DEFAULT false NOT NULL,
    question_count integer DEFAULT 0 NOT NULL,
    CONSTRAINT contests_submission_window_check CHECK (((due_at IS NULL) OR (available_from IS NULL) OR (due_at >= available_from)))
);


ALTER TABLE public.contests OWNER TO postgres;

--
-- TOC entry 226 (class 1259 OID 124499)
-- Name: contests_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.contests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.contests_id_seq OWNER TO postgres;

--
-- TOC entry 5291 (class 0 OID 0)
-- Dependencies: 226
-- Name: contests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.contests_id_seq OWNED BY public.contests.id;


--
-- TOC entry 227 (class 1259 OID 124500)
-- Name: contests_questions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.contests_questions (
    contest_id bigint NOT NULL,
    question_id bigint NOT NULL,
    original_order integer,
    point_weight numeric
);


ALTER TABLE public.contests_questions OWNER TO postgres;

--
-- TOC entry 228 (class 1259 OID 124507)
-- Name: q_choice_details; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.q_choice_details (
    id bigint NOT NULL,
    question_id bigint,
    content text,
    is_correct boolean DEFAULT false NOT NULL,
    order_index integer NOT NULL,
    is_shufflable boolean DEFAULT true NOT NULL
);


ALTER TABLE public.q_choice_details OWNER TO postgres;

--
-- TOC entry 229 (class 1259 OID 124518)
-- Name: q_choice_details_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.q_choice_details_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.q_choice_details_id_seq OWNER TO postgres;

--
-- TOC entry 5292 (class 0 OID 0)
-- Dependencies: 229
-- Name: q_choice_details_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.q_choice_details_id_seq OWNED BY public.q_choice_details.id;


--
-- TOC entry 244 (class 1259 OID 231285)
-- Name: q_coding_details; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.q_coding_details (
    question_id bigint NOT NULL,
    time_limit_c_cpp double precision DEFAULT 1.0,
    time_limit_java double precision DEFAULT 2.0,
    time_limit_python double precision DEFAULT 2.0,
    memory_limit integer DEFAULT 256,
    max_submissions integer DEFAULT 10,
    solution_code text,
    solution_language character varying(50)
);


ALTER TABLE public.q_coding_details OWNER TO postgres;

--
-- TOC entry 246 (class 1259 OID 231304)
-- Name: q_coding_testcases; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.q_coding_testcases (
    id bigint NOT NULL,
    question_id bigint,
    input_data text NOT NULL,
    output_data text NOT NULL,
    point_weight integer DEFAULT 1,
    is_public boolean DEFAULT false,
    description text,
    order_index integer DEFAULT 0,
    is_sample boolean DEFAULT false
);


ALTER TABLE public.q_coding_testcases OWNER TO postgres;

--
-- TOC entry 245 (class 1259 OID 231303)
-- Name: q_coding_testcases_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.q_coding_testcases_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.q_coding_testcases_id_seq OWNER TO postgres;

--
-- TOC entry 5293 (class 0 OID 0)
-- Dependencies: 245
-- Name: q_coding_testcases_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.q_coding_testcases_id_seq OWNED BY public.q_coding_testcases.id;


--
-- TOC entry 230 (class 1259 OID 124519)
-- Name: q_images; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.q_images (
    id bigint NOT NULL,
    question_id bigint,
    storage_path text,
    img_type character varying,
    img_scale numeric,
    raw_code text
);


ALTER TABLE public.q_images OWNER TO postgres;

--
-- TOC entry 231 (class 1259 OID 124525)
-- Name: q_images_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.q_images_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.q_images_id_seq OWNER TO postgres;

--
-- TOC entry 5294 (class 0 OID 0)
-- Dependencies: 231
-- Name: q_images_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.q_images_id_seq OWNED BY public.q_images.id;


--
-- TOC entry 232 (class 1259 OID 124526)
-- Name: q_shortans_details; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.q_shortans_details (
    id bigint NOT NULL,
    question_id bigint,
    content text
);


ALTER TABLE public.q_shortans_details OWNER TO postgres;

--
-- TOC entry 233 (class 1259 OID 124532)
-- Name: q_shortans_details_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.q_shortans_details_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.q_shortans_details_id_seq OWNER TO postgres;

--
-- TOC entry 5295 (class 0 OID 0)
-- Dependencies: 233
-- Name: q_shortans_details_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.q_shortans_details_id_seq OWNED BY public.q_shortans_details.id;


--
-- TOC entry 234 (class 1259 OID 124533)
-- Name: q_truefalse_details; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.q_truefalse_details (
    id bigint NOT NULL,
    question_id bigint,
    content text,
    is_correct boolean DEFAULT false NOT NULL,
    explaination text,
    order_index integer NOT NULL,
    is_shufflable boolean DEFAULT true NOT NULL
);


ALTER TABLE public.q_truefalse_details OWNER TO postgres;

--
-- TOC entry 235 (class 1259 OID 124544)
-- Name: q_truefalse_details_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.q_truefalse_details_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.q_truefalse_details_id_seq OWNER TO postgres;

--
-- TOC entry 5296 (class 0 OID 0)
-- Dependencies: 235
-- Name: q_truefalse_details_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.q_truefalse_details_id_seq OWNED BY public.q_truefalse_details.id;


--
-- TOC entry 236 (class 1259 OID 124545)
-- Name: questions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.questions (
    id bigint NOT NULL,
    teacher_id bigint,
    public_id uuid DEFAULT gen_random_uuid(),
    subject text,
    grade integer,
    parent_id bigint,
    question_type character varying,
    layout_type character varying,
    content text,
    solution text,
    chapter text,
    lesson text,
    complexity smallint,
    is_shufflable boolean,
    deleted_at timestamp without time zone
);


ALTER TABLE public.questions OWNER TO postgres;

--
-- TOC entry 237 (class 1259 OID 124552)
-- Name: questions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.questions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.questions_id_seq OWNER TO postgres;

--
-- TOC entry 5297 (class 0 OID 0)
-- Dependencies: 237
-- Name: questions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.questions_id_seq OWNED BY public.questions.id;


--
-- TOC entry 248 (class 1259 OID 231324)
-- Name: student_coding_submissions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.student_coding_submissions (
    id bigint NOT NULL,
    contest_result_id bigint,
    question_id bigint,
    source_code text NOT NULL,
    language character varying(50) NOT NULL,
    status character varying(50) DEFAULT 'Pending'::character varying,
    runtime_ms integer,
    memory_kb integer,
    score double precision DEFAULT 0.0,
    submitted_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    assignment_student_id bigint,
    attempt_number integer,
    compiler_output text
);


ALTER TABLE public.student_coding_submissions OWNER TO postgres;

--
-- TOC entry 247 (class 1259 OID 231323)
-- Name: student_coding_submissions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.student_coding_submissions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.student_coding_submissions_id_seq OWNER TO postgres;

--
-- TOC entry 5298 (class 0 OID 0)
-- Dependencies: 247
-- Name: student_coding_submissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.student_coding_submissions_id_seq OWNED BY public.student_coding_submissions.id;


--
-- TOC entry 238 (class 1259 OID 124553)
-- Name: student_option_submissions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.student_option_submissions (
    id bigint NOT NULL,
    contest_result_id bigint,
    question_id bigint,
    student_choice text,
    option_display_order text,
    is_correct boolean DEFAULT false,
    earned_point numeric(5,4) DEFAULT 0
);


ALTER TABLE public.student_option_submissions OWNER TO postgres;

--
-- TOC entry 239 (class 1259 OID 124561)
-- Name: student_option_submissions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.student_option_submissions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.student_option_submissions_id_seq OWNER TO postgres;

--
-- TOC entry 5299 (class 0 OID 0)
-- Dependencies: 239
-- Name: student_option_submissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.student_option_submissions_id_seq OWNED BY public.student_option_submissions.id;


--
-- TOC entry 240 (class 1259 OID 124562)
-- Name: students; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.students (
    id bigint NOT NULL,
    school character varying
);


ALTER TABLE public.students OWNER TO postgres;

--
-- TOC entry 241 (class 1259 OID 124568)
-- Name: students_classes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.students_classes (
    student_id bigint NOT NULL,
    class_id bigint NOT NULL,
    create_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.students_classes OWNER TO postgres;

--
-- TOC entry 242 (class 1259 OID 124574)
-- Name: students_contests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.students_contests (
    student_id bigint NOT NULL,
    contest_id bigint NOT NULL
);


ALTER TABLE public.students_contests OWNER TO postgres;

--
-- TOC entry 243 (class 1259 OID 124579)
-- Name: teachers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.teachers (
    id bigint NOT NULL,
    organization character varying,
    question_count integer DEFAULT 0
);


ALTER TABLE public.teachers OWNER TO postgres;

--
-- TOC entry 4938 (class 2604 OID 124585)
-- Name: accounts id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accounts ALTER COLUMN id SET DEFAULT nextval('public.accounts_id_seq'::regclass);


--
-- TOC entry 4942 (class 2604 OID 124586)
-- Name: classes id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.classes ALTER COLUMN id SET DEFAULT nextval('public.classes_id_seq'::regclass);


--
-- TOC entry 4947 (class 2604 OID 124587)
-- Name: contest_results id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contest_results ALTER COLUMN id SET DEFAULT nextval('public.contest_results_id_seq'::regclass);


--
-- TOC entry 4948 (class 2604 OID 124588)
-- Name: contests id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contests ALTER COLUMN id SET DEFAULT nextval('public.contests_id_seq'::regclass);


--
-- TOC entry 4953 (class 2604 OID 124589)
-- Name: q_choice_details id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.q_choice_details ALTER COLUMN id SET DEFAULT nextval('public.q_choice_details_id_seq'::regclass);


--
-- TOC entry 4973 (class 2604 OID 231307)
-- Name: q_coding_testcases id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.q_coding_testcases ALTER COLUMN id SET DEFAULT nextval('public.q_coding_testcases_id_seq'::regclass);


--
-- TOC entry 4956 (class 2604 OID 124590)
-- Name: q_images id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.q_images ALTER COLUMN id SET DEFAULT nextval('public.q_images_id_seq'::regclass);


--
-- TOC entry 4957 (class 2604 OID 124591)
-- Name: q_shortans_details id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.q_shortans_details ALTER COLUMN id SET DEFAULT nextval('public.q_shortans_details_id_seq'::regclass);


--
-- TOC entry 4958 (class 2604 OID 124592)
-- Name: q_truefalse_details id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.q_truefalse_details ALTER COLUMN id SET DEFAULT nextval('public.q_truefalse_details_id_seq'::regclass);


--
-- TOC entry 4961 (class 2604 OID 124593)
-- Name: questions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.questions ALTER COLUMN id SET DEFAULT nextval('public.questions_id_seq'::regclass);


--
-- TOC entry 4978 (class 2604 OID 231327)
-- Name: student_coding_submissions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_coding_submissions ALTER COLUMN id SET DEFAULT nextval('public.student_coding_submissions_id_seq'::regclass);


--
-- TOC entry 4963 (class 2604 OID 124594)
-- Name: student_option_submissions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_option_submissions ALTER COLUMN id SET DEFAULT nextval('public.student_option_submissions_id_seq'::regclass);


--
-- TOC entry 5008 (class 2606 OID 124600)
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);


--
-- TOC entry 5010 (class 2606 OID 124602)
-- Name: accounts accounts_public_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_public_id_key UNIQUE (public_id);


--
-- TOC entry 4999 (class 2606 OID 214816)
-- Name: contests check_valid_status; Type: CHECK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE public.contests
    ADD CONSTRAINT check_valid_status CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('inactive'::character varying)::text, ('deleted'::character varying)::text]))) NOT VALID;


--
-- TOC entry 5088 (class 2606 OID 239677)
-- Name: class_coding_assignments class_coding_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_coding_assignments
    ADD CONSTRAINT class_coding_assignments_pkey PRIMARY KEY (class_id, assignment_id);


--
-- TOC entry 5085 (class 2606 OID 239653)
-- Name: class_contests class_contests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_contests
    ADD CONSTRAINT class_contests_pkey PRIMARY KEY (class_id, contest_id);


--
-- TOC entry 5013 (class 2606 OID 124604)
-- Name: classes classes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_pkey PRIMARY KEY (id);


--
-- TOC entry 5015 (class 2606 OID 124606)
-- Name: classes classes_public_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_public_id_key UNIQUE (public_id);


--
-- TOC entry 5078 (class 2606 OID 239598)
-- Name: coding_assignment_questions coding_assignment_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coding_assignment_questions
    ADD CONSTRAINT coding_assignment_questions_pkey PRIMARY KEY (assignment_id, question_id);


--
-- TOC entry 5080 (class 2606 OID 239624)
-- Name: coding_assignment_students coding_assignment_students_assignment_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coding_assignment_students
    ADD CONSTRAINT coding_assignment_students_assignment_id_student_id_key UNIQUE (assignment_id, student_id);


--
-- TOC entry 5082 (class 2606 OID 239622)
-- Name: coding_assignment_students coding_assignment_students_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coding_assignment_students
    ADD CONSTRAINT coding_assignment_students_pkey PRIMARY KEY (id);


--
-- TOC entry 5070 (class 2606 OID 239570)
-- Name: coding_assignments coding_assignments_legacy_contest_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coding_assignments
    ADD CONSTRAINT coding_assignments_legacy_contest_id_key UNIQUE (legacy_contest_id);


--
-- TOC entry 5072 (class 2606 OID 239566)
-- Name: coding_assignments coding_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coding_assignments
    ADD CONSTRAINT coding_assignments_pkey PRIMARY KEY (id);


--
-- TOC entry 5074 (class 2606 OID 239568)
-- Name: coding_assignments coding_assignments_public_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coding_assignments
    ADD CONSTRAINT coding_assignments_public_id_key UNIQUE (public_id);


--
-- TOC entry 5091 (class 2606 OID 239717)
-- Name: coding_submission_testcase_results coding_submission_testcase_result_submission_id_order_index_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coding_submission_testcase_results
    ADD CONSTRAINT coding_submission_testcase_result_submission_id_order_index_key UNIQUE (submission_id, order_index);


--
-- TOC entry 5093 (class 2606 OID 239715)
-- Name: coding_submission_testcase_results coding_submission_testcase_results_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coding_submission_testcase_results
    ADD CONSTRAINT coding_submission_testcase_results_pkey PRIMARY KEY (id);


--
-- TOC entry 5019 (class 2606 OID 124608)
-- Name: contest_results contest_results_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contest_results
    ADD CONSTRAINT contest_results_pkey PRIMARY KEY (id);


--
-- TOC entry 5022 (class 2606 OID 124610)
-- Name: contests contests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contests
    ADD CONSTRAINT contests_pkey PRIMARY KEY (id);


--
-- TOC entry 5024 (class 2606 OID 124612)
-- Name: contests contests_public_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contests
    ADD CONSTRAINT contests_public_id_key UNIQUE (public_id);


--
-- TOC entry 5029 (class 2606 OID 124614)
-- Name: contests_questions pk_contests_questions; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contests_questions
    ADD CONSTRAINT pk_contests_questions PRIMARY KEY (contest_id, question_id);


--
-- TOC entry 5032 (class 2606 OID 124616)
-- Name: q_choice_details q_choice_details_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.q_choice_details
    ADD CONSTRAINT q_choice_details_pkey PRIMARY KEY (id);


--
-- TOC entry 5062 (class 2606 OID 231297)
-- Name: q_coding_details q_coding_details_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.q_coding_details
    ADD CONSTRAINT q_coding_details_pkey PRIMARY KEY (question_id);


--
-- TOC entry 5064 (class 2606 OID 231317)
-- Name: q_coding_testcases q_coding_testcases_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.q_coding_testcases
    ADD CONSTRAINT q_coding_testcases_pkey PRIMARY KEY (id);


--
-- TOC entry 5035 (class 2606 OID 124618)
-- Name: q_images q_images_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.q_images
    ADD CONSTRAINT q_images_pkey PRIMARY KEY (id);


--
-- TOC entry 5037 (class 2606 OID 124620)
-- Name: q_shortans_details q_shortans_details_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.q_shortans_details
    ADD CONSTRAINT q_shortans_details_pkey PRIMARY KEY (id);


--
-- TOC entry 5039 (class 2606 OID 124622)
-- Name: q_truefalse_details q_truefalse_details_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.q_truefalse_details
    ADD CONSTRAINT q_truefalse_details_pkey PRIMARY KEY (id);


--
-- TOC entry 5044 (class 2606 OID 124624)
-- Name: questions questions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.questions
    ADD CONSTRAINT questions_pkey PRIMARY KEY (id);


--
-- TOC entry 5046 (class 2606 OID 124626)
-- Name: questions questions_public_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.questions
    ADD CONSTRAINT questions_public_id_key UNIQUE (public_id);


--
-- TOC entry 5067 (class 2606 OID 231337)
-- Name: student_coding_submissions student_coding_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_coding_submissions
    ADD CONSTRAINT student_coding_submissions_pkey PRIMARY KEY (id);


--
-- TOC entry 5048 (class 2606 OID 124628)
-- Name: student_option_submissions student_option_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_option_submissions
    ADD CONSTRAINT student_option_submissions_pkey PRIMARY KEY (id);


--
-- TOC entry 5056 (class 2606 OID 124630)
-- Name: students_classes students_classes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.students_classes
    ADD CONSTRAINT students_classes_pkey PRIMARY KEY (student_id, class_id);


--
-- TOC entry 5058 (class 2606 OID 124632)
-- Name: students_contests students_contests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.students_contests
    ADD CONSTRAINT students_contests_pkey PRIMARY KEY (student_id, contest_id);


--
-- TOC entry 5051 (class 2606 OID 124634)
-- Name: students students_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_pkey PRIMARY KEY (id);


--
-- TOC entry 5060 (class 2606 OID 124636)
-- Name: teachers teachers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teachers
    ADD CONSTRAINT teachers_pkey PRIMARY KEY (id);


--
-- TOC entry 5011 (class 1259 OID 214817)
-- Name: idx_accounts_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_accounts_email ON public.accounts USING btree (email);


--
-- TOC entry 5089 (class 1259 OID 239694)
-- Name: idx_class_coding_assignments_assignment; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_class_coding_assignments_assignment ON public.class_coding_assignments USING btree (assignment_id);


--
-- TOC entry 5086 (class 1259 OID 239693)
-- Name: idx_class_contests_contest; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_class_contests_contest ON public.class_contests USING btree (contest_id);


--
-- TOC entry 5016 (class 1259 OID 214827)
-- Name: idx_classes_public_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_classes_public_id ON public.classes USING btree (public_id);


--
-- TOC entry 5017 (class 1259 OID 214829)
-- Name: idx_classes_teacher_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_classes_teacher_id ON public.classes USING btree (teacher_id);


--
-- TOC entry 5083 (class 1259 OID 239642)
-- Name: idx_coding_assignment_students_student; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_coding_assignment_students_student ON public.coding_assignment_students USING btree (student_id);


--
-- TOC entry 5075 (class 1259 OID 239641)
-- Name: idx_coding_assignments_class; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_coding_assignments_class ON public.coding_assignments USING btree (class_id);


--
-- TOC entry 5076 (class 1259 OID 239640)
-- Name: idx_coding_assignments_teacher; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_coding_assignments_teacher ON public.coding_assignments USING btree (teacher_id);


--
-- TOC entry 5065 (class 1259 OID 239643)
-- Name: idx_coding_submissions_progress_question; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_coding_submissions_progress_question ON public.student_coding_submissions USING btree (assignment_student_id, question_id, submitted_at DESC);


--
-- TOC entry 5094 (class 1259 OID 239728)
-- Name: idx_coding_testcase_results_submission; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_coding_testcase_results_submission ON public.coding_submission_testcase_results USING btree (submission_id, order_index);


--
-- TOC entry 5020 (class 1259 OID 214824)
-- Name: idx_contest_results_contest_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_contest_results_contest_id ON public.contest_results USING btree (contest_id);


--
-- TOC entry 5025 (class 1259 OID 214830)
-- Name: idx_contests_class_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_contests_class_id ON public.contests USING btree (class_id);


--
-- TOC entry 5027 (class 1259 OID 214823)
-- Name: idx_contests_questions_contest_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_contests_questions_contest_id ON public.contests_questions USING btree (contest_id);


--
-- TOC entry 5026 (class 1259 OID 214822)
-- Name: idx_contests_teacher_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_contests_teacher_id ON public.contests USING btree (teacher_id);


--
-- TOC entry 5030 (class 1259 OID 214820)
-- Name: idx_q_choice_details_question_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_q_choice_details_question_id ON public.q_choice_details USING btree (question_id);


--
-- TOC entry 5033 (class 1259 OID 214821)
-- Name: idx_q_images_question_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_q_images_question_id ON public.q_images USING btree (question_id);


--
-- TOC entry 5040 (class 1259 OID 214828)
-- Name: idx_questions_dashboard; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_questions_dashboard ON public.questions USING btree (teacher_id) WHERE ((deleted_at IS NULL) AND (parent_id IS NULL));


--
-- TOC entry 5041 (class 1259 OID 214819)
-- Name: idx_questions_parent_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_questions_parent_id ON public.questions USING btree (parent_id) WHERE (parent_id IS NOT NULL);


--
-- TOC entry 5042 (class 1259 OID 214818)
-- Name: idx_questions_search; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_questions_search ON public.questions USING btree (teacher_id, subject, grade) WHERE (deleted_at IS NULL);


--
-- TOC entry 5052 (class 1259 OID 214826)
-- Name: idx_sc_class_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_sc_class_id ON public.students_classes USING btree (class_id);


--
-- TOC entry 5053 (class 1259 OID 214825)
-- Name: idx_sc_student_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_sc_student_id ON public.students_classes USING btree (student_id);


--
-- TOC entry 5054 (class 1259 OID 214831)
-- Name: idx_students_classes_class_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_students_classes_class_id ON public.students_classes USING btree (class_id);


--
-- TOC entry 5068 (class 1259 OID 239644)
-- Name: uq_coding_submission_attempt; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX uq_coding_submission_attempt ON public.student_coding_submissions USING btree (assignment_student_id, question_id, attempt_number) WHERE ((assignment_student_id IS NOT NULL) AND (attempt_number IS NOT NULL));


--
-- TOC entry 5049 (class 1259 OID 239700)
-- Name: uq_submission_result_question; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX uq_submission_result_question ON public.student_option_submissions USING btree (contest_result_id, question_id);


--
-- TOC entry 5131 (class 2606 OID 239688)
-- Name: class_coding_assignments class_coding_assignments_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_coding_assignments
    ADD CONSTRAINT class_coding_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.accounts(id) ON DELETE SET NULL;


--
-- TOC entry 5132 (class 2606 OID 239683)
-- Name: class_coding_assignments class_coding_assignments_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_coding_assignments
    ADD CONSTRAINT class_coding_assignments_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.coding_assignments(id) ON DELETE CASCADE;


--
-- TOC entry 5133 (class 2606 OID 239678)
-- Name: class_coding_assignments class_coding_assignments_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_coding_assignments
    ADD CONSTRAINT class_coding_assignments_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- TOC entry 5128 (class 2606 OID 239664)
-- Name: class_contests class_contests_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_contests
    ADD CONSTRAINT class_contests_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.accounts(id) ON DELETE SET NULL;


--
-- TOC entry 5129 (class 2606 OID 239654)
-- Name: class_contests class_contests_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_contests
    ADD CONSTRAINT class_contests_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- TOC entry 5130 (class 2606 OID 239659)
-- Name: class_contests class_contests_contest_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_contests
    ADD CONSTRAINT class_contests_contest_id_fkey FOREIGN KEY (contest_id) REFERENCES public.contests(id) ON DELETE CASCADE;


--
-- TOC entry 5124 (class 2606 OID 239599)
-- Name: coding_assignment_questions coding_assignment_questions_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coding_assignment_questions
    ADD CONSTRAINT coding_assignment_questions_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.coding_assignments(id) ON DELETE CASCADE;


--
-- TOC entry 5125 (class 2606 OID 239604)
-- Name: coding_assignment_questions coding_assignment_questions_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coding_assignment_questions
    ADD CONSTRAINT coding_assignment_questions_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id) ON DELETE RESTRICT;


--
-- TOC entry 5126 (class 2606 OID 239625)
-- Name: coding_assignment_students coding_assignment_students_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coding_assignment_students
    ADD CONSTRAINT coding_assignment_students_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.coding_assignments(id) ON DELETE CASCADE;


--
-- TOC entry 5127 (class 2606 OID 239630)
-- Name: coding_assignment_students coding_assignment_students_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coding_assignment_students
    ADD CONSTRAINT coding_assignment_students_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- TOC entry 5121 (class 2606 OID 239571)
-- Name: coding_assignments coding_assignments_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coding_assignments
    ADD CONSTRAINT coding_assignments_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE SET NULL;


--
-- TOC entry 5122 (class 2606 OID 239581)
-- Name: coding_assignments coding_assignments_legacy_contest_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coding_assignments
    ADD CONSTRAINT coding_assignments_legacy_contest_id_fkey FOREIGN KEY (legacy_contest_id) REFERENCES public.contests(id) ON DELETE SET NULL;


--
-- TOC entry 5123 (class 2606 OID 239576)
-- Name: coding_assignments coding_assignments_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coding_assignments
    ADD CONSTRAINT coding_assignments_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- TOC entry 5134 (class 2606 OID 239718)
-- Name: coding_submission_testcase_results coding_submission_testcase_results_submission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coding_submission_testcase_results
    ADD CONSTRAINT coding_submission_testcase_results_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.student_coding_submissions(id) ON DELETE CASCADE;


--
-- TOC entry 5135 (class 2606 OID 239723)
-- Name: coding_submission_testcase_results coding_submission_testcase_results_testcase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.coding_submission_testcase_results
    ADD CONSTRAINT coding_submission_testcase_results_testcase_id_fkey FOREIGN KEY (testcase_id) REFERENCES public.q_coding_testcases(id) ON DELETE SET NULL;


--
-- TOC entry 5098 (class 2606 OID 181032)
-- Name: contests contests_fk_teachers; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contests
    ADD CONSTRAINT contests_fk_teachers FOREIGN KEY (teacher_id) REFERENCES public.teachers(id);


--
-- TOC entry 5110 (class 2606 OID 124638)
-- Name: students fk_account_student; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT fk_account_student FOREIGN KEY (id) REFERENCES public.accounts(id);


--
-- TOC entry 5115 (class 2606 OID 124643)
-- Name: teachers fk_account_teacher; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teachers
    ADD CONSTRAINT fk_account_teacher FOREIGN KEY (id) REFERENCES public.accounts(id);


--
-- TOC entry 5100 (class 2606 OID 124653)
-- Name: contests_questions fk_contests_questions_contests; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contests_questions
    ADD CONSTRAINT fk_contests_questions_contests FOREIGN KEY (contest_id) REFERENCES public.contests(id) ON DELETE CASCADE;


--
-- TOC entry 5101 (class 2606 OID 124658)
-- Name: contests_questions fk_contests_questions_questions; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contests_questions
    ADD CONSTRAINT fk_contests_questions_questions FOREIGN KEY (question_id) REFERENCES public.questions(id) ON DELETE CASCADE;


--
-- TOC entry 5099 (class 2606 OID 181027)
-- Name: contests fk_contests_teacher; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contests
    ADD CONSTRAINT fk_contests_teacher FOREIGN KEY (teacher_id) REFERENCES public.teachers(id);


--
-- TOC entry 5106 (class 2606 OID 124663)
-- Name: questions fk_parent_question; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.questions
    ADD CONSTRAINT fk_parent_question FOREIGN KEY (parent_id) REFERENCES public.questions(id);


--
-- TOC entry 5102 (class 2606 OID 124668)
-- Name: q_choice_details fk_question_images; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.q_choice_details
    ADD CONSTRAINT fk_question_images FOREIGN KEY (question_id) REFERENCES public.questions(id);


--
-- TOC entry 5103 (class 2606 OID 124673)
-- Name: q_images fk_question_images; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.q_images
    ADD CONSTRAINT fk_question_images FOREIGN KEY (question_id) REFERENCES public.questions(id);


--
-- TOC entry 5104 (class 2606 OID 124678)
-- Name: q_shortans_details fk_question_images; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.q_shortans_details
    ADD CONSTRAINT fk_question_images FOREIGN KEY (question_id) REFERENCES public.questions(id);


--
-- TOC entry 5105 (class 2606 OID 124683)
-- Name: q_truefalse_details fk_question_images; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.q_truefalse_details
    ADD CONSTRAINT fk_question_images FOREIGN KEY (question_id) REFERENCES public.questions(id);


--
-- TOC entry 5107 (class 2606 OID 124688)
-- Name: questions fk_questions_teacher; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.questions
    ADD CONSTRAINT fk_questions_teacher FOREIGN KEY (teacher_id) REFERENCES public.teachers(id);


--
-- TOC entry 5108 (class 2606 OID 124693)
-- Name: student_option_submissions fk_student_option_submissions_contest_results; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_option_submissions
    ADD CONSTRAINT fk_student_option_submissions_contest_results FOREIGN KEY (contest_result_id) REFERENCES public.contest_results(id);


--
-- TOC entry 5109 (class 2606 OID 124698)
-- Name: student_option_submissions fk_student_option_submissions_questions; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_option_submissions
    ADD CONSTRAINT fk_student_option_submissions_questions FOREIGN KEY (question_id) REFERENCES public.questions(id);


--
-- TOC entry 5111 (class 2606 OID 124703)
-- Name: students_classes fk_students_classes_classes; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.students_classes
    ADD CONSTRAINT fk_students_classes_classes FOREIGN KEY (class_id) REFERENCES public.classes(id);


--
-- TOC entry 5112 (class 2606 OID 124708)
-- Name: students_classes fk_students_classes_students; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.students_classes
    ADD CONSTRAINT fk_students_classes_students FOREIGN KEY (student_id) REFERENCES public.students(id);


--
-- TOC entry 5096 (class 2606 OID 124713)
-- Name: contest_results fk_students_contests_contests; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contest_results
    ADD CONSTRAINT fk_students_contests_contests FOREIGN KEY (contest_id) REFERENCES public.contests(id);


--
-- TOC entry 5113 (class 2606 OID 124718)
-- Name: students_contests fk_students_contests_contests; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.students_contests
    ADD CONSTRAINT fk_students_contests_contests FOREIGN KEY (contest_id) REFERENCES public.contests(id);


--
-- TOC entry 5097 (class 2606 OID 124723)
-- Name: contest_results fk_students_contests_students; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contest_results
    ADD CONSTRAINT fk_students_contests_students FOREIGN KEY (student_id) REFERENCES public.students(id);


--
-- TOC entry 5114 (class 2606 OID 124728)
-- Name: students_contests fk_students_contests_students; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.students_contests
    ADD CONSTRAINT fk_students_contests_students FOREIGN KEY (student_id) REFERENCES public.students(id);


--
-- TOC entry 5095 (class 2606 OID 124733)
-- Name: classes fk_teacher_classes; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT fk_teacher_classes FOREIGN KEY (teacher_id) REFERENCES public.teachers(id);


--
-- TOC entry 5116 (class 2606 OID 231298)
-- Name: q_coding_details q_coding_details_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.q_coding_details
    ADD CONSTRAINT q_coding_details_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id) ON DELETE CASCADE;


--
-- TOC entry 5117 (class 2606 OID 231318)
-- Name: q_coding_testcases q_coding_testcases_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.q_coding_testcases
    ADD CONSTRAINT q_coding_testcases_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id) ON DELETE CASCADE;


--
-- TOC entry 5118 (class 2606 OID 239635)
-- Name: student_coding_submissions student_coding_submissions_assignment_student_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_coding_submissions
    ADD CONSTRAINT student_coding_submissions_assignment_student_fkey FOREIGN KEY (assignment_student_id) REFERENCES public.coding_assignment_students(id) ON DELETE CASCADE;


--
-- TOC entry 5119 (class 2606 OID 231338)
-- Name: student_coding_submissions student_coding_submissions_contest_result_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_coding_submissions
    ADD CONSTRAINT student_coding_submissions_contest_result_id_fkey FOREIGN KEY (contest_result_id) REFERENCES public.contest_results(id) ON DELETE CASCADE;


--
-- TOC entry 5120 (class 2606 OID 231343)
-- Name: student_coding_submissions student_coding_submissions_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_coding_submissions
    ADD CONSTRAINT student_coding_submissions_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id) ON DELETE CASCADE;


-- Completed on 2026-08-05 15:04:25

--
-- PostgreSQL database dump complete
--

\unrestrict kZc0G4ajxcDRdtcvJXfAMFQSVc93upn4TBgBao58FtrwFjafuQYUK3jW7dhktIn

