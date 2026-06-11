import { sql } from "../db/client.ts";
import type { PersonaGroupConfig } from "../persona_group.mts";
import { rowToGroupConfig, rowToPersonaConfig } from "./reconstruct.ts";

/**
 * Postgres-backed persona groups, scoped per owner. Each group's personae are
 * joined in via the ordered `persona_group_members` table and reconstructed, so
 * the returned config matches the old embedded-personae shape.
 */
export const groupRepo = {
	async listByOwner(
		ownerId: string,
	): Promise<{ name: string; config: PersonaGroupConfig }[]> {
		const groups = await sql`
			select * from persona_groups where user_id = ${ownerId} order by group_key
		`;
		const result: { name: string; config: PersonaGroupConfig }[] = [];
		for (const g of groups) {
			const members = await sql`
				select p.* from persona_group_members m
				join personae p on p.id = m.persona_id
				where m.group_id = ${g.id}
				order by m.position
			`;
			result.push({
				name: g.group_key,
				config: rowToGroupConfig(g, members.map(rowToPersonaConfig)),
			});
		}
		return result;
	},
};
