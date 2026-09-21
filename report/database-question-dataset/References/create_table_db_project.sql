drop table if exists accounts, teachers, students, classes, students_classes, questions, q_images, q_choice_details, q_truefalse_details, q_shortans_details, contests, students_contests, contest_results, student_option_submissions cascade;

-- 1. Tao bang accounts
create table accounts (
	id bigserial primary key, 
	public_id uuid unique,
	email varchar not null, 
	password varchar not null, 
	is_active boolean default true, 
	role varchar not null,
	create_at timestamp not null default current_timestamp
);

-- 2. Tao bang teachers
create table teachers(
	id bigint primary key constraint fk_account_teacher references accounts(id),
	name varchar,
	avatar_url varchar,
	organization varchar
);

-- 3. Tao bang students
create table students(
	id bigint primary key constraint fk_account_student references accounts(id),
	name varchar,
	avatar_url varchar
);

-- 4. Tao bang classes
create table classes(
	id bigserial primary key,
	teacher_id bigint constraint fk_teacher_classes references teachers(id),
	public_id uuid unique,
	class_name text not null,
	description text,
	create_at timestamp default current_timestamp
);

-- 5. Tao bang students_classes
create table students_classes(
	student_id bigint constraint fk_students_classes_students references students(id),
	class_id bigint constraint fk_students_classes_classes references classes(id),
	create_at timestamp default current_timestamp,
	primary key(student_id, class_id)
);

-- 6. Tao bang questions
create table questions(
	id bigserial primary key,
	teacher_id bigint constraint fk_questions_teacher references teachers(id),
	public_id uuid unique,
	subject text,
	grade int,
	parent_id bigint constraint fk_parent_question references questions(id),
	question_type varchar,
	layout_type varchar,
	content text,
	solution text,
	chapter text,
	lesson text,
	complexity smallint,
	is_shufflable boolean
);
-- 7. Tao bang q_images
create table q_images(
	id bigserial primary key,
	question_id bigint constraint fk_question_images references questions(id),
	storage_path text,
	img_type varchar,
	img_scale decimal,
	raw_code text
);


-- 8. Tao bang q_choice_details
create table q_choice_details(
	id bigserial primary key,
	question_id bigint constraint fk_question_images references questions(id),
	content text,
	is_correct boolean not null default false,
	order_index int not null,
	is_shufflable boolean not null default true
);

-- 9. Tao bang q_truefalse_details
create table q_truefalse_details(
	id bigserial primary key,
	question_id bigint constraint fk_question_images references questions(id),
	content text,
	is_correct boolean not null default false,
	explaination text,
	order_index int not null,
	is_shufflable boolean not null default true
);

-- 10. Tao bang q_shortans_details
create table q_shortans_details(
	id bigserial primary key,
	question_id bigint constraint fk_question_images references questions(id),
	content text
);

-- 11. Tao bang contests
create table contests(
	id bigserial primary key,
	class_id bigint constraint fk_contest_classes references classes(id),
	public_id uuid unique,
	title text not null,
	time_limit int not null,
	scoring_config jsonb not null,
	status varchar not null
);

-- 12. Tao bang students_contests
create table students_contests(
	student_id bigint constraint fk_students_contests_students references students(id),
	contest_id bigint constraint fk_students_contests_contests references contests(id),
	primary key(student_id, contest_id)
);

-- 13. Tao bang contest_results
create table contest_results(
	id bigserial primary key,
	student_id bigint constraint fk_students_contests_students references students(id),
	contest_id bigint constraint fk_students_contests_contests references contests(id),
	start_time timestamp,
	end_time timestamp,
	total_score decimal,
	count_wrong_answers int,
	display_order text
);

-- 14. Tao bang student_option_submissions
create table student_option_submissions(
	id bigserial primary key,
	contest_result_id bigint constraint fk_student_option_submissions_contest_results references contest_results(id),
	question_id bigint constraint fk_student_option_submissions_questions references questions(id),
	student_choice text,
	option_display_order text,
	is_correct boolean default false,
	earned_point decimal(5,4) default 0
);


-- select * from accounts;
-- select * from teachers;
-- select * from students;
-- select * from classes;
-- select * from students_classes;
-- select * from questions;
