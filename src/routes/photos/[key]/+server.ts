import { readPhoto } from '$lib/server/photo-store';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	if (!/^[a-f0-9]{64}\.jpg$/.test(params.key)) return new Response(null, { status: 404 });
	try {
		const photo = await readPhoto(params.key);
		if (!photo.Body) return new Response(null, { status: 404 });
		return new Response(new Uint8Array(await photo.Body.transformToByteArray()).buffer, {
			headers: {
				'Content-Type': 'image/jpeg',
				'Cache-Control': 'public, max-age=31536000, immutable',
				'X-Content-Type-Options': 'nosniff'
			}
		});
	} catch (error) {
		if ((error as { name?: string }).name === 'NoSuchKey')
			return new Response(null, { status: 404 });
		return new Response('Photo storage unavailable', { status: 503 });
	}
};
