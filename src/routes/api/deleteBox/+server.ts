import { json } from '@sveltejs/kit';
import Box from '$lib/models/box';
import connectDB from '$lib/db/connect';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ request }) => {
	const { id } = await request.json();
	await connectDB();
	try {
		let deletedBox = await Box.findOneAndDelete({ id: id });
		if (!deletedBox) {
			return json({ error: 'No box with id found' }, { status: 404 });
		}
		return json({ status: 'ok' });
	} catch (error) {
		return json(
			{ error: 'Unexpected Server Error', details: (error as Error).message },
			{ status: 500 }
		);
	}
};
