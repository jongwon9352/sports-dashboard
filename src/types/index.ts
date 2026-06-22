export type MaturityStatus = 'Pre' | 'Mid' | 'Post';
export type Position = 'GK' | 'CB' | 'FB' | 'MF' | 'WF' | 'CF' | 'CAM' | 'CDM' | 'CM' | 'FW' | 'DF' | 'ST' | 'RW' | 'LW' | 'RB' | 'LB';
export type Grade = 'U15' | 'U14' | 'U13' | '3학년' | '2학년' | '1학년';

export interface Player {
  id: string;
  name: string;
  jersey_number: number;
  position: Position;
  grade: Grade;
  birth_date: string;
  maturity_status: MaturityStatus;
  maturity_offset: number;
  predicted_adult_height: number;
  current_height: number;
  current_weight: number;
  latest_mas: number | null;
  latest_mss: number | null;
  preferred_foot: string;
  photo_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface TrainingSession {
  id: string;
  player_id: string;
  training_date: string;
  session_name: string;
  duration_min: number;
  total_distance: number;
  m_per_min: number;
  hsr_distance: number;
  hsr_custom: number;
  sprint_distance: number;
  sprint_custom: number;
  sprint_count: number;
  sprint_count_custom: number;
  acc_count: number;
  dec_count: number;
  acd_load: number;
  max_speed: number;
  created_at: string;
}

export interface TrainingDaily {
  id: string;
  player_id: string;
  training_date: string;
  day_of_week: string;
  week_label: string;
  duration_min: number;
  rpe: number | null;
  total_distance: number;
  m_per_min: number;
  speed_zone_1: number;
  speed_zone_2: number;
  speed_zone_3: number;
  speed_zone_4: number;
  speed_zone_5: number;
  hsr_distance: number;
  hsr_custom: number;
  sprint_distance: number;
  sprint_custom: number;
  sprint_count: number;
  sprint_count_custom: number;
  acc_count: number;
  dec_count: number;
  acd_load: number;
  max_speed: number;
  daily_training_load: number | null;
  created_at: string;
}

export interface AcwrDaily {
  id: string;
  player_id: string;
  date: string;
  daily_load: number;
  acute_ewma: number;
  chronic_ewma: number;
  acwr: number;
  data_sufficient: boolean;
  created_at: string;
}

export interface PhysicalReport {
  id: string;
  player_id: string;
  test_date: string;
  test_round: string;
  height: number;
  weight: number;
  leg_length: number;
  sitting_height: number;
  maturity_offset: number;
  predicted_adult_height: number;
  phv_age: number;
  nordic_curl_left: number;
  nordic_curl_right: number;
  hip_ab_left: number;
  hip_ab_right: number;
  hip_ad_left: number;
  hip_ad_right: number;
  sprint_5m_time: number;
  sprint_10m_time: number;
  sprint_30m_time: number;
  cmj_height: number;
  rebound_jump_height: number;
  squat_jump_height: number;
  cod_run: number;
  cod_ball: number;
  mas_value: number | null;
  mss_value: number | null;
  created_at: string;
}

export interface MatchData {
  id: string;
  player_id: string;
  match_date: string;
  opponent: string;
  event_type: string;
  player_group: string | null;
  position_played: string | null;
  play_time_min: number;
  rpe: number | null;
  total_distance: number;
  hsr_distance: number;
  sprint_distance: number;
  sprint_count: number;
  acc_count: number;
  dec_count: number;
  max_speed: number;
  created_at: string;
}

export type AcwrZone = 'safe' | 'caution' | 'danger' | 'insufficient';

export interface PlayerWithAcwr extends Player {
  acwr_data?: AcwrDaily;
  acwr_zone: AcwrZone;
  monotony?: number;
}

export interface TeamDailyAggregate {
  date: string;
  td_mean: number;
  hsr_mean: number;
  sprint_mean: number;
  rpe_mean: number;
  player_count: number;
}

export interface DailyReportRow {
  player_name: string;
  jersey_number: number | null;
  position: string | null;
  player_id: string;
  duration_min: number;
  total_distance: number;
  m_per_min: number;
  hsr_distance: number;
  hsr_custom: number;
  sprint_distance: number;
  sprint_custom: number;
  sprint_count: number;
  sprint_count_custom: number;
  acc_count: number;
  dec_count: number;
  acd_load: number;
  max_speed: number;
  rpe: number | null;
  daily_training_load: number | null;
}

export interface SidebarPlayer {
  id: string;
  name: string;
  acwr: number | null;
  zone: AcwrZone;
}
