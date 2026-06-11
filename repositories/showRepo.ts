import { sql } from "../db/client.ts";
import type { ShowConfig } from "../show.mts";
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
			const roster = await sql`
				select p.* from show_roster r
				join personae p on p.id = r.persona_id
				where r.show_id = ${s.id}
				order by r.position
			`;
			result.push(rowToShowConfig(s, roster.map(rowToPersonaConfig)));
		}
		return result;
	},
};
