import {type Credentials} from "google-auth-library";
import {OAuth2Client} from "googleapis-common";
import {createServer} from "http";
import {google} from "googleapis";
import type {FullTopicContext, VideoMetadata} from "../steps/generate_topic.mts";
import {Readable} from "node:stream";
import type {OutputConfig} from "../types/app";
import {adminOwnerId} from "../db/users.ts";
import {channelsRepo} from "../repositories/channelsRepo.ts";

// 1. Replace these with your credentials from Google Cloud Console
const CLIENT_ID = process.env.GOOGLE_OAUTH2_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH2_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_OAUTH2_LOCAL_REDIRECT_URL;

/** YouTube scopes requested for every channel connection (CLI + web flows). */
export const GOOGLE_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.force-ssl",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
];

/**
 * Build the Google consent URL for the browser-based flow. `redirectUri` MUST
 * exactly match an Authorized redirect URI on the OAuth client AND the one
 * passed later to {@link exchangeCodeForTokens}. `prompt: "consent"` +
 * `access_type: "offline"` guarantee a refresh_token is returned.
 */
export function buildWebAuthUrl(redirectUri: string, state: string): string {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error("Google OAuth client env vars are missing");
  }
  const client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, redirectUri);
  return client.generateAuthUrl({
    access_type: "offline",
    scope: GOOGLE_OAUTH_SCOPES,
    prompt: "consent",
    include_granted_scopes: true,
    state,
  });
}

/** Exchange an authorization code (from the web callback) for tokens. */
export async function exchangeCodeForTokens(
  redirectUri: string,
  code: string,
): Promise<Credentials> {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error("Google OAuth client env vars are missing");
  }
  const client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, redirectUri);
  const { tokens } = await client.getToken(code);
  return tokens;
}

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
    scope: [
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube.force-ssl",
      "https://www.googleapis.com/auth/yt-analytics.readonly",
    ],
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
  const ownerId = await adminOwnerId();

  const tokens = await channelsRepo.getGoogleTokens(ownerId, channelId);
  if (!tokens) {
    throw new Error('Channel credentials missing for ' + channelId);
  }

  auth.setCredentials(tokens);

  // Persist refreshed tokens with an atomic single-row update (no shared-file
  // read-modify-write race). The library only emits changed fields, so merge.
  auth.on("tokens", async (newTokens) => {
    await channelsRepo.setGoogleTokens(ownerId, channelId, {
      ...tokens,
      ...newTokens,
    });
    console.log(`🔄 Google tokens refreshed for channel "${channelId}".`);
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

  if (!response.data.id) {
    throw new Error('Youtube upload did not throw but did not return a video ID')
  }

  console.log('Adding video to playlist..')
  await addVideoToPlaylist(auth, response.data.id, 'Daily podcasts')

  try {
    await postSubscribeComment(auth, response.data.id, "Don't forget to subscribe for daily videos!");
  } catch (e) {
    console.warn('Failed to post subscribe comment (non-fatal):', e);
  }

  return response.data;
}

// YouTube Data API v3 has no public endpoint for pinning a comment — pinning
// is only available via YouTube Studio UI / the internal app API. We post the
// comment as the channel owner and rely on manual pinning if desired.
async function postSubscribeComment(auth: OAuth2Client, videoId: string, text: string) {
  const youtube = google.youtube({ version: 'v3', auth });

  const response = await youtube.commentThreads.insert({
    part: ['snippet'],
    requestBody: {
      snippet: {
        videoId,
        topLevelComment: {
          snippet: { textOriginal: text },
        },
      },
    },
  });

  console.log(`Posted comment on ${videoId}: ${response.data.id}`);
  return response.data;
}

async function addVideoToPlaylist(auth: OAuth2Client, videoId: string, targetTitle: string) {
  const service = google.youtube({ version: 'v3', auth });

  const listResponse = await service.playlists.list({
    part: ['snippet'],
    mine: true,
    maxResults: 50
  });

  console.log('LISTRES', listResponse)

  let playlist = listResponse.data.items?.find(p => p.snippet?.title === targetTitle);
  let playlistId;

  if (playlist) {
    console.log(`Found existing playlist: ${targetTitle}`);
    playlistId = playlist.id;
  } else {
    console.log(`Creating new playlist: ${targetTitle}`);
    const createResponse = await service.playlists.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: { title: targetTitle, description: 'Main channel playlist' },
        status: { privacyStatus: 'public' }
      }
    });
    playlistId = createResponse.data.id;
  }

  // 3. Add the video to the playlist
  await service.playlistItems.insert({
    part: ['snippet'],
    requestBody: {
      snippet: {
        playlistId: playlistId,
        resourceId: {
          kind: 'youtube#video',
          videoId: videoId
        }
      }
    }
  });

  console.log('Video successfully added to playlist!');
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