import { sql } from "../db/client.ts";
import type { ShowConfig, ShowStatus } from "../show.mts";
import { rowToPersonaConfig, rowToShowConfig } from "./reconstruct.ts";

/**
 * Postgres-backed shows, scoped per owner. The cast roster is joined in via the
 * ordered `show_roster` table and reconstructed.
 */
export const showRepo = {
	async listByOwner(ownerId: string): Promise<ShowConfig[]> {
		const shows = await sql`
			select * from shows where user_id = ${ownerId} order by show_key
		`;
		const result: ShowConfig[] = [];
		for (const s of shows) {
			const [roster, locations] = await Promise.all([
				sql`
					select p.* from show_roster r
					join personae p on p.id = r.persona_id
					where r.show_id = ${s.id}
					order by r.position
				`,
				sql`
					select location_key, name, description, asset_kind, asset_ext
					from show_locations where show_id = ${s.id}
					order by position, location_key
				`,
			]);
			result.push(rowToShowConfig(s, roster.map(rowToPersonaConfig), locations));
		}
		return result;
	},

	/**
	 * Set a show's lifecycle status by its key. Key-scoped (not owner-scoped) so
	 * the breakdown worker, which only knows the show key, can flip the state when
	 * the job starts/finishes.
	 */
	async setStatusByKey(showKey: string, status: ShowStatus): Promise<void> {
		await sql`update shows set status = ${status} where show_key = ${showKey}`;
	},
};
