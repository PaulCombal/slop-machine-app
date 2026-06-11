import { Hono } from "hono";
import { config } from "../config.ts";
import { currentOwner } from "../currentOwner.ts";
import { definitionsRepo } from "../repositories/definitions.ts";
import { jobsRepo } from "../repositories/jobs.ts";
import { schedulesRepo } from "../repositories/schedules.ts";
import { JobsTable } from "../views/components.tsx";
import { BULLBOARD_QUEUE } from "../views/format.ts";
import { Layout } from "../views/layout.tsx";

export const dashboard = new Hono();

function Card({
	label,
	value,
	href,
}: {
	label: string;
	value: number;
	href?: string;
}) {
	const inner = (
		<>
			<div style="font-size:1.8rem;font-weight:600">{value}</div>
			<div style="opacity:.7">{label}</div>
		</>
	);
	return (
		<div style="border:1px solid #8884;border-radius:8px;padding:1rem 1.25rem;min-width:7rem">
			{href ? (
				<a href={href} style="text-decoration:none;color:inherit">
					{inner}
				</a>
			) : (
				inner
			)}
		</div>
	);
}

dashboard.get("/", async (c) => {
	const owner = await currentOwner(c);
	const [personae, groups, shows] = await Promise.all([
		definitionsRepo.personae(owner),
		definitionsRepo.groups(owner),
		definitionsRepo.shows(owner),
	]);
	const scheduleList = await schedulesRepo.list();
	const counts = await jobsRepo.counts();
	const recent = await jobsRepo.recent(10);

	return c.html(
		<Layout title="Dashboard">
			<p>
				Control plane online —{" "}
				{config.debug ? (
					<strong>DEBUG mode (dummy assets, no real uploads)</strong>
				) : (
					<strong style="color:#c33">
						LIVE mode (triggers can publish to real channels)
					</strong>
				)}
				.
			</p>

			<div style="display:flex;gap:1rem;flex-wrap:wrap;margin:1rem 0">
				<Card label="personae" value={personae.length} href="/personae" />
				<Card label="groups" value={groups.length} href="/groups" />
				<Card label="shows" value={shows.length} href="/shows" />
				<Card label="schedules" value={scheduleList.length} href="/schedules" />
			</div>

			<h2>Queue</h2>
			<div style="display:flex;gap:1rem;flex-wrap:wrap;margin:1rem 0">
				<Card label="active" value={counts.active ?? 0} href="/runs" />
				<Card label="waiting" value={counts.waiting ?? 0} href="/runs" />
				<Card label="delayed" value={counts.delayed ?? 0} href="/runs" />
				<Card label="completed" value={counts.completed ?? 0} href="/runs" />
				<Card label="failed" value={counts.failed ?? 0} href="/runs" />
			</div>

			<h2>
				Recent jobs{" "}
				<a href="/runs" style="font-weight:normal;font-size:.8em">
					(all / trigger →)
				</a>{" "}
				<a
					href={BULLBOARD_QUEUE}
					target="_blank"
					rel="noreferrer"
					style="font-weight:normal;font-size:.8em"
				>
					(bullboard ↗)
				</a>
			</h2>
			<JobsTable jobs={recent} />
		</Layout>,
	);
});
