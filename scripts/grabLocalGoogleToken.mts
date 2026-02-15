import { grabOauthTokenLocally } from "../utils/google.mts";

const credentials = await grabOauthTokenLocally();
console.log(credentials);
