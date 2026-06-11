import { sql } from "../db/client.ts";
import type { PersonaConfig } from "../personae.mts";
import { rowToPersonaConfig } from "./reconstruct.ts";

/**
 * Postgres-backed personae, scoped per owner. Returns reconstructed
 * PersonaConfig objects (with live prompt closures) so callers are identical to
 * the old code registry.
 */
export const personaRepo = {
	async listByOwner(ownerId: string): Promise<PersonaConfig[]> {
		const rows = await sql`
			select * from personae where user_id = ${ownerId} order by persona_key
		`;
		return rows.map(rowToPersonaConfig);
	},
};
