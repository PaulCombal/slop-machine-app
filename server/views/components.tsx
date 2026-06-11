import type { JobDTO } from "../dto.ts";
import { fmtTime } from "./format.ts";
import { Layout } from "./layout.tsx";

/** Shared inline style for the small create/trigger forms. */
export const FORM_STYLE =
	"display:flex;gap:1rem;align-items:end;flex-wrap:wrap;margin-bottom:1.5rem";

/** A full-page error with a back link, returned with a 4xx by callers. */
export function Problem(message: string, backHref: string, backLabel: string) {
	return (
		<Layout title="Problem">
			<p style="color:#c33">{message}</p>
			<p>
				<a href={backHref}>← {backLabel}</a>
			</p>
		</Layout>
	);
}

/** Recent-jobs table, shared by the dashboard and the runs page. */
export function JobsTable({
	jobs,
	showAttempts = false,
}: {
	jobs: JobDTO[];
	showAttempts?: boolean;
}) {
	const cols = showAttempts ? 6 : 5;
	return (
		<table>
			<thead>
				<tr>
					<th>id</th>
					<th>job</th>
					<th>target</th>
					<th>state</th>
					<th>created</th>
					{showAttempts && <th>attempts</th>}
				</tr>
			</thead>
			<tbody>
				{jobs.map((j) => (
					<tr>
						<td>
							<code>{j.id}</code>
						</td>
						<td>{j.name}</td>
						<td>{j.summary}</td>
						<td>
							{j.state}
							{j.failedReason ? (
								<span style="color:#c33" title={j.failedReason}>
									{" "}
									⚠
								</span>
							) : null}
						</td>
						<td>{fmtTime(j.createdAt)}</td>
						{showAttempts && <td>{j.attemptsMade}</td>}
					</tr>
				))}
				{jobs.length === 0 && (
					<tr>
						<td colspan={cols}>No recent jobs.</td>
					</tr>
				)}
			</tbody>
		</table>
	);
}
