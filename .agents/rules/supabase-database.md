---
trigger: always_on
---

# Supabase Database & Architecture Rules

Always follow these principles when designing, planning, or writing database code for the Sign_Speak project:

1. **Target Database**: Always target **Supabase (PostgreSQL)**. Do not generate code or setup for SQLite, MySQL, or local MongoDB unless explicitly specified.

2. **Design Standards (@karpathy-guidelines)**:
   - Ensure database normalization (3NF) to eliminate redundancy.
   - Every table MUST have a Primary Key (`id` using UUID `gen_random_uuid()`).
   - Define strict Foreign Key constraints, data types, and `NOT NULL` checks where appropriate.
   - Always include `created_at` and `updated_at` timestamps.

3. **Mandatory Row Level Security (RLS) Policies**:
   - MUST include `ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;` for EVERY created table.
   - MUST explicitly write granular RLS policies for each CRUD operation (`SELECT`, `INSERT`, `UPDATE`, `DELETE`).
   - Define access controls clearly (e.g., `auth.uid() = user_id` for user data, or `true` for public read access).
   - NEVER leave a table with RLS enabled without at least one valid policy.

4. **Workflow for Database Changes**:
   - **Step 1 (Planning)**: Always analyze core entities, list relationships, and specify security rules before writing any SQL.
   - **Step 2 (Migration Script)**: Generate clean, production-ready PostgreSQL migration scripts compatible with the **Supabase SQL Editor**.
   - **Step 3 (Integration)**: Use `@supabase/supabase-js` client SDK with environment variables (`SUPABASE_URL` and `SUPABASE_ANON_KEY`).

5. **Schema Output Location**:
   - Save all generated SQL migration scripts into a folder named `supabase/migrations/` at the root of the project.
