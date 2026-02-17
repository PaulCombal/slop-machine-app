import { type Credentials, OAuth2Client } from "google-auth-library";
import { createServer } from "http";
import { google } from "googleapis";
import type { VideoMetadata } from "../steps/generate_topic.mts";

// 1. Replace these with your credentials from Google Cloud Console
const CLIENT_ID = process.env.GOOGLE_OAUTH2_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH2_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_OAUTH2_LOCAL_REDIRECT_URL;

export async function grabOauthTokenLocally(): Promise<Credentials> {
	if (!CLIENT_ID) {
		throw new Error("Google client ID not set");
	}

	if (!CLIENT_SECRET) {
		throw new Error("Google client secret not set");
	}

	if (!REDIRECT_URI) {
		throw new Error("Google redirect URI not set");
	}

	const client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

	const authUrl = client.generateAuthUrl({
		access_type: "offline",
		scope: ["https://www.googleapis.com/auth/youtube.upload"],
		prompt: "consent",
	});

	console.log("\n🚀 Step 1: Authorize the app by visiting this URL:\n");
	console.log(authUrl);
	console.log("\nWaiting for redirect on http://localhost:8000...\n");

	return new Promise((resolve, reject) => {
		const server = createServer(async (req, res) => {
			try {
				const url = new URL(req.url!, `http://${req.headers.host}`);
				const code = url.searchParams.get("code");

				if (code) {
					// 1. Get the tokens
					const { tokens } = await client.getToken(code);

					// 2. Respond to the browser
					res.writeHead(200, { "Content-Type": "text/html" });
					res.end("<h1>Success!</h1><p>You can close this tab now.</p>");

					// 3. Stop the server and return the tokens
					server.close(() => {
						console.log("✔ Local server stopped.");
						resolve(tokens);
					});
				}
			} catch (e) {
				res.writeHead(500);
				res.end("Authentication failed.");
				server.close();
				reject(e);
			}
		}).listen(8000);
	});
}

export async function getAuthenticatedClient(): Promise<OAuth2Client> {
	if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
		throw new Error("Google OAuth environment variables are missing");
	}

	const auth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
	const tokensFile = Bun.file("/assets/debug/google_tokens.json");

	if (!(await tokensFile.exists())) {
		throw new Error("Tokens not found. Run authorization first.");
	}

	const tokens = await tokensFile.json();
	auth.setCredentials(tokens);

	// Auto-save refreshed tokens back to the parent directory
	auth.on("tokens", async (newTokens) => {
		const current = await tokensFile.json();
		await Bun.write(
			"/assets/debug/google_tokens.json",
			JSON.stringify({ ...current, ...newTokens }, null, 2),
		);
		console.log("🔄 Tokens synced to parent directory.");
	});

	return auth;
}

// 2. Focused Execution Function
export async function uploadShort(
	meta: VideoMetadata,
	auth: OAuth2Client,
	videoPath: string,
) {
	if (process.env.DEBUG !== "false" || process.env.SKIP_YT_UPLOAD) {
		console.log("Skipping upload to YT in debug mode");
		return null;
	}

	const title =
		meta.title
			.split(" ")
			.filter((word) => word !== "#Shorts")
			.join(" ") +
		" " +
		meta.hashtags.filter((tag) => tag !== "#Shorts").join(" ") +
		" #Shorts";

	const youtube = google.youtube({ version: "v3", auth });

	console.log("🚀 Starting upload via authenticated client...");

	const response = await youtube.videos.insert({
		part: ["snippet", "status"],
		requestBody: {
			snippet: {
				title,
				description: meta.description,
				categoryId: "42",
			},
			status: {
				privacyStatus: "private",
				selfDeclaredMadeForKids: false,
			},
		},
		media: {
			body: Bun.s3.file(videoPath),
		},
	});

	console.log(`✅ Upload Successful! ID: ${response.data.id}`);
	console.log(`Watch URL: https://youtube.com/shorts/${response.data.id}`);
	return response.data;
}
