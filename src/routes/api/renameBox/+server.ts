import { json } from '@sveltejs/kit';
import Box from '$lib/models/box';
import connectDB from '$lib/db/connect';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ request }) => {
	const { id, editBoxName } = await request.json();

	if (process.env.ENVIRONMENT === 'DEMO') {
		return json(
			{
				error: 'This action is not allowed in demo mode'
			},
			{ status: 403 }
		);
	}

	if (!id || !editBoxName) {
		return json({ error: 'Missing required fields' }, { status: 400 });
	}
	if (id === editBoxName) {
		return json({ error: 'New name cannot be the same as the old name' }, { status: 400 });
	}
	try {
		await connectDB();

		const originalBox = await Box.findById(id);
		if (!originalBox) {
			return json({ error: 'Box not found' }, { status: 404 });
		}
		const newBox = await Box.create({
			_id: editBoxName,
			contents: originalBox.contents,
			images: originalBox.images,
			lastModified: Date.now()
		});
		await Box.findByIdAndDelete({ _id: id });

		return json({ newID: newBox._id }, { status: 202 });
	} catch (e) {
		return json(
			{ error: 'Unexpected Server Error', details: (e as Error).message },
			{ status: 500 }
		);
	}
};
