import type { FC, PropsWithChildren } from "hono/jsx";
import { config } from "../config.ts";
import { FORM_CSS } from "./forms.tsx";

const NAV = [
	["/", "Dashboard"],
	["/personae", "Personae"],
	["/groups", "Groups"],
	["/shows", "Shows"],
	["/themes", "Themes"],
	["/satisfying", "Satisfying"],
	["/channels", "Channels"],
	["/schedules", "Schedules"],
	["/runs", "Runs"],
] as const;

/**
 * HTML shell: nav, minimal CSS, HTMX for form posts. Every page renders
 * through this so the chrome stays in one place.
 */
export const Layout: FC<PropsWithChildren<{ title: string }>> = ({
	title,
	children,
}) => (
	<html lang="en">
		<head>
			<meta charset="utf-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1" />
			<title>{title} · video-machine</title>
			<script src="https://unpkg.com/htmx.org@2.0.10" />
			<style>{CSS + FORM_CSS}</style>
		</head>
		<body>
			<nav>
				<strong>video-machine</strong>
				{NAV.map(([href, label]) => (
					<a href={href}>{label}</a>
				))}
				<a href={config.bullboardUrl} target="_blank" rel="noreferrer">
					bullboard ↗
				</a>
				<form method="post" action="/logout" style="margin-left:auto">
					<button type="submit" class="linkbtn">
						log out
					</button>
				</form>
			</nav>
			<main>
				<h1>{title}</h1>
				{children}
			</main>
		</body>
	</html>
);

const CSS = `
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body { margin: 0; font: 15px/1.5 system-ui, sans-serif; }
nav { display: flex; gap: 1rem; align-items: center; padding: .75rem 1.5rem;
      border-bottom: 1px solid #8884; flex-wrap: wrap; }
nav a { text-decoration: none; opacity: .8; }
nav a:hover { opacity: 1; text-decoration: underline; }
main { padding: 1.5rem; max-width: 960px; }
table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; padding: .4rem .6rem; border-bottom: 1px solid #8884; }
code { background: #8882; padding: .1rem .3rem; border-radius: 3px; }
.linkbtn { background: none; border: 0; padding: 0; font: inherit; color: inherit;
           opacity: .8; cursor: pointer; text-decoration: none; }
.linkbtn:hover { opacity: 1; text-decoration: underline; }
`;
