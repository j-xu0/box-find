import { json } from '@sveltejs/kit';
import Box from '$lib/models/box';
import connectDB from '$lib/db/connect';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ request }) => {
	const { id, contents } = await request.json();

	if (!id || !contents) {
		return json({ error: 'Invalid request' }, { status: 400 });
	}
	try {
		await connectDB();

		const box = await Box.findOne({ id: id }).exec();
		if (box) {
			box.contents = contents;
			box.lastModified = Date.now();
			await box.save();
		} else {
			return json({ error: 'Box not found' }, { status: 404 });
		}
		return json({ status: 'ok' });
	} catch (e) {
		return json(
			{ error: 'Unexpected Server Error', details: (e as Error).message },
			{ status: 500 }
		);
	}
};
