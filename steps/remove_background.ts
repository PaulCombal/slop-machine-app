import {
	cloudinaryConfigured,
	removeBackgroundCloudinary,
} from "../clients/cloudinary.ts";

// Make a stance PNG transparent via Cloudinary; returns the image unchanged when
// unconfigured or on failure, so the generate/preview/save loop keeps working.
export async function removeBackground(png: Uint8Array): Promise<Uint8Array> {
	if (!cloudinaryConfigured()) {
		return png;
	}
	try {
		return await removeBackgroundCloudinary(png);
	} catch (e) {
		console.warn("background removal failed, keeping original:", e);
		return png;
	}
}
