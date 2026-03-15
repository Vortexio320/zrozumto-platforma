-- Task attempts table: tracks student answers to Neo4j exam tasks
CREATE TABLE IF NOT EXISTS task_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  zadanie_id TEXT NOT NULL,
  is_correct BOOLEAN,
  answer_data JSONB DEFAULT '{}'::jsonb,
  ai_feedback JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_attempts_user_id ON task_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_task_attempts_zadanie_id ON task_attempts(zadanie_id);
CREATE INDEX IF NOT EXISTS idx_task_attempts_user_created ON task_attempts(user_id, created_at DESC);

-- Worked examples cache: stores AI-generated step-by-step solutions per task
CREATE TABLE IF NOT EXISTS worked_examples (
  zadanie_id TEXT PRIMARY KEY,
  steps TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies
ALTER TABLE task_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own task attempts"
  ON task_attempts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert task attempts"
  ON task_attempts FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can read all task attempts"
  ON task_attempts FOR SELECT
  USING (true);
