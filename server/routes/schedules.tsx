import { Hono } from "hono";
import { currentOwner } from "../currentOwner.ts";
import { definitionsRepo } from "../repositories/definitions.ts";
import { schedulesRepo } from "../repositories/schedules.ts";
import { FORM_STYLE, Problem } from "../views/components.tsx";
import { fmtTime } from "../views/format.ts";
import { Layout } from "../views/layout.tsx";

export const schedules = new Hono();

const problem = (msg: string) =>
	Problem(msg, "/schedules", "back to schedules");

function targetLabel(
	s: Awaited<ReturnType<typeof schedulesRepo.list>>[number],
) {
	const t = s.target;
	switch (t.kind) {
		case "news":
			return `${t.personaGroupName} / ${t.carryingPersona}`;
		case "show":
			return t.showId;
		case "system":
			return "system";
		default:
			return t.jobName;
	}
}

// ---- List + create form -----------------------------------------------

schedules.get("/schedules", async (c) => {
	const owner = await currentOwner(c);
	const rows = await schedulesRepo.list();
	const groups = await definitionsRepo.groups(owner);
	const personae = await definitionsRepo.personae(owner);
	const shows = await definitionsRepo.shows(owner);

	return c.html(
		<Layout title="Schedules">
			<table>
				<thead>
					<tr>
						<th>id</th>
						<th>type</th>
						<th>cadence</th>
						<th>next run</th>
						<th>target</th>
						<th />
					</tr>
				</thead>
				<tbody>
					{rows.map((s) => (
						<tr>
							<td>
								<code>{s.id}</code>
							</td>
							<td>{s.target.kind}</td>
							<td>
								{s.cron ? (
									<code>{s.cron}</code>
								) : s.everyMs ? (
									`${s.everyMs}ms`
								) : (
									"—"
								)}
							</td>
							<td>{fmtTime(s.nextRun)}</td>
							<td>{targetLabel(s)}</td>
							<td>
								{s.editable ? (
									<form
										method="post"
										action={`/schedules/${encodeURIComponent(s.id)}/delete`}
									>
										<button type="submit">delete</button>
									</form>
								) : (
									<span style="opacity:.6">locked</span>
								)}
							</td>
						</tr>
					))}
					{rows.length === 0 && (
						<tr>
							<td colspan={6}>No schedules.</td>
						</tr>
					)}
				</tbody>
			</table>

			<h2>New news schedule</h2>
			<form method="post" action="/schedules" style={FORM_STYLE}>
				<input type="hidden" name="type" value="news" />
				<label>
					id <input name="id" required placeholder="daily-peterlois" />
				</label>
				<label>
					cron <input name="pattern" required placeholder="30 22 * * *" />
				</label>
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
				<button type="submit">create</button>
			</form>

			<h2>New show schedule</h2>
			<form method="post" action="/schedules" style={FORM_STYLE}>
				<input type="hidden" name="type" value="show" />
				<label>
					id <input name="id" required placeholder="secretStory-drip" />
				</label>
				<label>
					cron <input name="pattern" required placeholder="0 20 * * *" />
				</label>
				<label>
					show
					<select name="showId" required>
						{shows.map((s) => (
							<option value={s.id}>{s.id}</option>
						))}
					</select>
				</label>
				<button type="submit">create</button>
			</form>
		</Layout>,
	);
});

// ---- Create -----------------------------------------------------------

schedules.post("/schedules", async (c) => {
	const body = await c.req.parseBody();
	const str = (k: string) => String(body[k] ?? "").trim();

	const type = str("type");
	const id = str("id");
	const pattern = str("pattern");

	if (!id) return c.html(problem("Schedule id is required."), 400);
	if (!pattern) return c.html(problem("Cron pattern is required."), 400);

	const owner = await currentOwner(c);
	try {
		if (type === "news") {
			const personaGroupName = str("personaGroupName");
			const carryingPersona = str("carryingPersona");
			if (!(await definitionsRepo.group(owner, personaGroupName)))
				return c.html(problem(`Unknown group "${personaGroupName}".`), 400);
			if (!(await definitionsRepo.persona(owner, carryingPersona)))
				return c.html(problem(`Unknown persona "${carryingPersona}".`), 400);
			await schedulesRepo.createNews({
				id,
				pattern,
				personaGroupName,
				carryingPersona,
			});
		} else if (type === "show") {
			const showId = str("showId");
			if (!(await definitionsRepo.show(owner, showId)))
				return c.html(problem(`Unknown show "${showId}".`), 400);
			await schedulesRepo.createShow({ id, pattern, showId });
		} else {
			return c.html(problem(`Unknown schedule type "${type}".`), 400);
		}
	} catch (err) {
		// BullMQ rejects malformed cron patterns here.
		return c.html(
			problem(`Could not create schedule: ${(err as Error).message}`),
			400,
		);
	}

	return c.redirect("/schedules", 303);
});

// ---- Delete -----------------------------------------------------------

schedules.post("/schedules/:id/delete", async (c) => {
	const id = c.req.param("id");
	const existing = await schedulesRepo.get(id);
	if (!existing) return c.html(problem(`No schedule "${id}".`), 404);
	if (!existing.editable)
		return c.html(
			problem(`"${id}" is a system schedule and cannot be deleted.`),
			400,
		);

	await schedulesRepo.remove(id);
	return c.redirect("/schedules", 303);
});
