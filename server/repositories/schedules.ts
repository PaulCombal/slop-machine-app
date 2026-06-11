import { assetsQueue } from "../../clients/queues.mts";
import { type ScheduleDTO, toScheduleDTO } from "../dto.ts";

/**
 * Thin wrapper over BullMQ's job-scheduler API. BullMQ persists scheduler
 * templates in Valkey, so this IS the source of truth — no separate store.
 * The worker only seeds defaults once (see messageHandler), so creates/deletes
 * here survive restarts.
 */
export const schedulesRepo = {
	async list(): Promise<ScheduleDTO[]> {
		const raw = await assetsQueue.getJobSchedulers(0, -1, true);
		return raw.map(toScheduleDTO);
	},

	async get(id: string): Promise<ScheduleDTO | undefined> {
		return (await this.list()).find((s) => s.id === id);
	},

	/** News pipeline drip: one short from a persona group on a cron. */
	async createNews(input: {
		id: string;
		pattern: string;
		personaGroupName: string;
		carryingPersona: string;
	}): Promise<void> {
		await assetsQueue.upsertJobScheduler(
			input.id,
			{ pattern: input.pattern },
			{
				name: "trigger-video-flow",
				data: {
					personaGroupName: input.personaGroupName,
					carryingPersona: input.carryingPersona,
				},
			},
		);
	},

	/** Show drip: one episode per tick; the tick self-removes when the series ends. */
	async createShow(input: {
		id: string;
		pattern: string;
		showId: string;
	}): Promise<void> {
		await assetsQueue.upsertJobScheduler(
			input.id,
			{ pattern: input.pattern },
			{
				name: "show-tick",
				data: { showId: input.showId, schedulerId: input.id },
			},
		);
	},

	async remove(id: string): Promise<boolean> {
		return assetsQueue.removeJobScheduler(id);
	},
};
