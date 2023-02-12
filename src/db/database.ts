import mysql, { Connection } from "mysql2/promise";
import type { QuaverMap, QuaverMapset } from "../structures";

export default class DatabaseManager {
  connection: Connection;

  constructor() {
    this.init();
  }

  async init() {
    this.connection = await mysql.createConnection({
      host: process.env.DATABASE_HOST,
      user: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASSWORD,
      database: "quaver",
    });
  }

  async existing_mapsets(): Promise<number[]> {
    const query = "SELECT id FROM Mapset";

    const [rows] = await this.connection.execute(query);
    const rowArray = Array.isArray(rows) ? rows : [rows];

    return rowArray.map((i: any) => i.id);
  }

  async upsert_map(map: QuaverMap): Promise<void | Error> {
    const query =
      "REPLACE INTO Map VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
    const values = [
      map.id,
      map.mapset_id,
      map.md5,
      map.alternative_md5,
      map.creator_id,
      map.creator_username,
      map.game_mode,
      map.ranked_status,
      map.artist,
      map.title,
      map.source,
      map.tags,
      map.description,
      map.difficulty_name,
      map.length,
      map.bpm,
      map.difficulty_rating,
      map.count_hitobject_normal,
      map.count_hitobject_long,
      map.play_count,
      map.fail_count,
      map.mods_pending,
      map.mods_accepted,
      map.mods_denied,
      map.mods_ignored,
      map.online_offset,
      map.clan_ranked,
    ];

    try {
      await this.connection.execute(query, values);
    } catch (err) {
      return new Error(`Unable to upsert map: ${err.message}`);
    }
  }

  async upsert_mapset(mapset: QuaverMapset): Promise<void | Error> {
    const query = "REPLACE INTO Mapset VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
    const values = [
      mapset.id,
      mapset.creator_id,
      mapset.creator_username,
      mapset.creator_avatar_url,
      mapset.artist,
      mapset.title,
      mapset.source,
      mapset.tags,
      mapset.description,
      new Date(mapset.date_submitted),
      new Date(mapset.date_last_updated),
      mapset.ranking_queue_status,
      new Date(mapset.ranking_queue_last_updated),
      mapset.ranking_queue_vote_count,
      mapset.mapset_ranking_queue_id,
    ];

    try {
      await this.connection.execute(query, values);
    } catch (err) {
      return new Error(`Unable to upsert mapset: ${err.message}`);
    }
  }
}
