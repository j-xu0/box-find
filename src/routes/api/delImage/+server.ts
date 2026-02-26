import { json } from '@sveltejs/kit';
import connectDB from '$lib/db/connect';
import Box from '$lib/models/box';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ request }) => {
	const { id, base64 } = await request.json();

	if (process.env.ENVIRONMENT === 'DEMO') {
		return json(
			{
				error: 'This action is not allowed in demo mode'
			},
			{ status: 403 }
		);
	}

	try {
		await connectDB();
		const box = await Box.findOne({ id: id }).exec();
		if (box) {
			box.images.pull(base64);
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
