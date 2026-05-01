import {type Credentials} from "google-auth-library";
import {OAuth2Client} from "googleapis-common";
import {createServer} from "http";
import {google} from "googleapis";
import type {FullTopicContext, VideoMetadata} from "../steps/generate_topic.mts";
import {Readable} from "node:stream";
import type {OutputConfig} from "../types/app";

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
          const {tokens} = await client.getToken(code);

          // 2. Respond to the browser
          res.writeHead(200, {"Content-Type": "text/html"});
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

export async function getAuthenticatedClient(channelId: string): Promise<OAuth2Client> {
  if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
    throw new Error("Google OAuth environment variables are missing");
  }

  const auth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
  const tokensFile = Bun.s3.file("credentials/google_tokens.json");

  if (!(await tokensFile.exists())) {
    throw new Error("Tokens not found. Run authorization first.");
  }

  const allTokens = await tokensFile.json();
  if (!allTokens[channelId]) {
    throw new Error('Channel credentials missing for ' + channelId);
  }

  const tokens = allTokens[channelId];
  auth.setCredentials(tokens);

  // Auto-save refreshed tokens back to the parent directory
  auth.on("tokens", async (newTokens) => {
    const current = await tokensFile.json();
    await Bun.s3.write(
      "credentials/google_tokens.json",
      JSON.stringify({...current, [channelId]: newTokens}, null, 2),
    );
    console.log("🔄 Tokens synced to parent directory.");
  });

  return auth;
}

// 2. Focused Execution Function
export async function uploadShort(
  fullTopicContext: FullTopicContext,
  auth: OAuth2Client,
  videoPath: string,
) {
  if (process.env.DEBUG !== "false" || process.env.SKIP_YT_UPLOAD) {
    console.log("Skipping upload to YT in debug mode");
    return null;
  }

  if (!fullTopicContext.category) {
    throw new Error('Category not set before youtube upload');
  }

  const meta = fullTopicContext.videoMetadata;

  const rawTitle = meta.title.split(" ").filter(w => w.toLowerCase() !== "#shorts").join(" ");
  const cleanTags = meta.hashtags.filter(t => t.toLowerCase() !== "#shorts").join(" ");

  const suffix = " #Shorts";
  const tagsString = cleanTags.length > 0 ? " " + cleanTags : "";
  const reservedLength = tagsString.length + suffix.length; // Length of hashtags + " #Shorts"
  const maxTitleLength = 99 - reservedLength;

  let finalTitlePart = rawTitle;

// 2. Only ellipsize the title part if it's too long
  if (rawTitle.length > maxTitleLength) {
    // Ensure we have at least room for "..."
    finalTitlePart = maxTitleLength > 3
      ? rawTitle.substring(0, maxTitleLength - 3).trim() + "..."
      : rawTitle.substring(0, Math.max(0, maxTitleLength));
  }

// 3. Assemble: [Ellipsized Title] [Hashtags] #Shorts
  const title = (finalTitlePart + tagsString + suffix).trim();

  const youtube = google.youtube({version: "v3", auth});

  console.log(`🚀 Starting upload (${title}) via authenticated client...`);
  const s3File = Bun.s3.file(videoPath);

  const response = await youtube.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title,
        description: meta.description,
        categoryId: fullTopicContext.category,
      },
      status: {
        privacyStatus: process.env.UPLOAD_VISIBILITY || "public",
        selfDeclaredMadeForKids: false,
      },
    },
    media: {
      body: Readable.fromWeb(s3File.stream() as any),
    },
  });

  return response.data;
}

export async function reuploadShort(renderId: string, channelId: string) {
  if (process.env.DEBUG !== "false" || process.env.SKIP_YT_UPLOAD) {
    console.log("Skipping upload to YT in debug mode");
    return null;
  }

  const googleCredentials = await getAuthenticatedClient(channelId);
  const config: OutputConfig = await Bun.s3.file('output/' + renderId + '/config.json').json();
  const metadata = config.topic;
  return uploadShort(metadata, googleCredentials, 'output/' + renderId + '/render.mp4')
}