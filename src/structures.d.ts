export interface QuaverMapset {
  id: number;
  creator_id?: number;
  creator_username?: string;
  creator_avatar_url?: string;
  artist?: string;
  title?: string;
  source?: string;
  tags?: string;
  description?: string;
  date_submitted?: string;
  date_last_updated?: string;
  ranking_queue_status?: number;
  ranking_queue_last_updated?: string;
  ranking_queue_vote_count?: number;
  mapset_ranking_queue_id?: number;
  maps?: QuaverMap[];
}

export interface QuaverMap {
  id: number;
  mapset_id: number;
  md5: string;
  alternative_md5?: string;
  creator_id?: number;
  creator_username?: string;
  game_mode?: number;
  ranked_status?: number;
  artist?: string;
  title?: string;
  source?: string;
  tags?: string;
  description?: string;
  difficulty_name?: string;
  length?: number;
  bpm?: number;
  difficulty_rating?: number;
  count_hitobject_normal?: number;
  count_hitobject_long?: number;
  play_count?: number;
  fail_count?: number;
  mods_pending?: number;
  mods_accepted?: number;
  mods_denied?: number;
  mods_ignored?: number;
  online_offset?: number;
  clan_ranked?: number;
}
