import { json } from '@sveltejs/kit';
import Box from '$lib/models/box';
import connectDB from '$lib/db/connect';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const { importObj } = await request.json();

	if (process.env.ENVIRONMENT === 'DEMO') {
		return json(
			{
				error: 'This action is not allowed in demo mode'
			},
			{ status: 403 }
		);
	}

	await connectDB();

	for (const box of importObj) {
		try {
			await Box.create({
				_id: box._id,
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
