import { json } from '@sveltejs/kit';
import Box from '$lib/models/box';
import connectDB from '$lib/db/connect';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const { importObj } = await request.json();

	await connectDB();

	for (const box of importObj) {
		try {
			await Box.create({
				id: box.id,
				contents: box.contents,
				images: box.images,
				lastModified: Date.now()
			});
		} catch (e) {
			return json(
				{ error: 'Unexpected Server Error', details: (e as Error).message },
				{ status: 500 }
			);
		}
	}
	return json({ status: 'ok' });
};
