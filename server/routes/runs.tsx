import { Hono } from "hono";
import { config } from "../config.ts";
import { currentOwner } from "../currentOwner.ts";
import { definitionsRepo } from "../repositories/definitions.ts";
import { jobsRepo } from "../repositories/jobs.ts";
import { FORM_STYLE, JobsTable, Problem } from "../views/components.tsx";
import { BULLBOARD_QUEUE } from "../views/format.ts";
import { Layout } from "../views/layout.tsx";

export const runs = new Hono();

const problem = (msg: string) => Problem(msg, "/runs", "back to runs");

// ---- List jobs + trigger forms ----------------------------------------

runs.get("/runs", async (c) => {
	const owner = await currentOwner(c);
	const jobs = await jobsRepo.recent();
	const groups = await definitionsRepo.groups(owner);
	const personae = await definitionsRepo.personae(owner);
	const shows = await definitionsRepo.shows(owner);

	return c.html(
		<Layout title="Runs">
			{config.debug ? (
				<p>
					<strong>DEBUG mode</strong> — triggers produce dummy assets, no real
					uploads.
				</p>
			) : (
				<p style="color:#c33">
					<strong>LIVE mode</strong> — triggering can publish to real channels.
				</p>
			)}

			<h2>Trigger a news run</h2>
			<form method="post" action="/runs/trigger" style={FORM_STYLE}>
				<input type="hidden" name="type" value="news" />
				<label>
					group
					<select name="personaGroupName" required>
						{groups.map((g) => (
							<option value={g.name}>{g.name}</option>
						))}
					</select>
				</label>
				<label>
					carrying persona
					<select name="carryingPersona" required>
						{personae.map((p) => (
							<option value={p.id}>{p.id}</option>
						))}
					</select>
				</label>
				<button type="submit">trigger</button>
			</form>

			<h2>Trigger a show tick</h2>
			<form method="post" action="/runs/trigger" style={FORM_STYLE}>
				<input type="hidden" name="type" value="show" />
				<label>
					show
					<select name="showId" required>
						{shows.map((s) => (
							<option value={s.id}>{s.id}</option>
						))}
					</select>
				</label>
				<button type="submit">trigger</button>
			</form>

			<h2>
				Recent jobs{" "}
				<a
					href={BULLBOARD_QUEUE}
					target="_blank"
					rel="noreferrer"
					style="font-weight:normal;font-size:.8em"
				>
					(bullboard ↗)
				</a>
			</h2>
			<JobsTable jobs={jobs} showAttempts />
		</Layout>,
	);
});

// ---- Trigger ----------------------------------------------------------

runs.post("/runs/trigger", async (c) => {
	const body = await c.req.parseBody();
	const str = (k: string) => String(body[k] ?? "").trim();
	const type = str("type");

	const owner = await currentOwner(c);
	try {
		if (type === "news") {
			const personaGroupName = str("personaGroupName");
			const carryingPersona = str("carryingPersona");
			if (!(await definitionsRepo.group(owner, personaGroupName)))
				return c.html(problem(`Unknown group "${personaGroupName}".`), 400);
			if (!(await definitionsRepo.persona(owner, carryingPersona)))
				return c.html(problem(`Unknown persona "${carryingPersona}".`), 400);
			await jobsRepo.triggerNews(personaGroupName, carryingPersona);
		} else if (type === "show") {
			const showId = str("showId");
			if (!(await definitionsRepo.show(owner, showId)))
				return c.html(problem(`Unknown show "${showId}".`), 400);
			await jobsRepo.triggerShow(showId);
		} else {
			return c.html(problem(`Unknown trigger type "${type}".`), 400);
		}
	} catch (err) {
		return c.html(problem(`Could not enqueue: ${(err as Error).message}`), 400);
	}

	return c.redirect("/runs", 303);
});
