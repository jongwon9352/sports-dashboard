CREATE TABLE IF NOT EXISTS match_session_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  match_date DATE NOT NULL,
  opponent TEXT NOT NULL,
  session_name TEXT NOT NULL,
  play_time_min NUMERIC DEFAULT 0,
  total_distance NUMERIC DEFAULT 0,
  m_per_min NUMERIC DEFAULT 0,
  hsr_distance NUMERIC DEFAULT 0,
  hsr_custom NUMERIC DEFAULT 0,
  sprint_distance NUMERIC DEFAULT 0,
  sprint_custom NUMERIC DEFAULT 0,
  sprint_count NUMERIC DEFAULT 0,
  sprint_count_custom NUMERIC DEFAULT 0,
  acc_count NUMERIC DEFAULT 0,
  dec_count NUMERIC DEFAULT 0,
  acd_load NUMERIC DEFAULT 0,
  max_speed NUMERIC DEFAULT 0,
  action_count NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX match_session_player_date_opponent_session
  ON match_session_data (player_id, match_date, opponent, session_name);

ALTER TABLE match_session_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon read" ON match_session_data FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert" ON match_session_data FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update" ON match_session_data FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon delete" ON match_session_data FOR DELETE TO anon USING (true);

-- Also update csv_uploads check to include 'match_session'
ALTER TABLE csv_uploads DROP CONSTRAINT IF EXISTS csv_uploads_file_type_check;
ALTER TABLE csv_uploads ADD CONSTRAINT csv_uploads_file_type_check
  CHECK (file_type = ANY (ARRAY['session'::text, 'daily'::text, 'match'::text, 'match_session'::text]));
