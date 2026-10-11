import { json } from '@sveltejs/kit';
import Box from '$lib/models/box';
import connectDB from '$lib/db/connect';
import type { RequestHandler } from './$types';
import { PhotoError, processPhoto } from '$lib/server/photo-processing';

export const PATCH: RequestHandler = async ({ request }) => {
	try {
		const { id, base64 } = await request.json();
		if (typeof id !== 'string' || !id.trim()) {
			return json({ error: 'Provide a valid box ID' }, { status: 400 });
		}
		const compressedBase64 = await processPhoto(base64);

		await connectDB();
		const box = await Box.findOne({ id: id }).exec();
		if (box) {
			if (!box.images.includes(compressedBase64)) box.images.push(compressedBase64);
			box.lastModified = Date.now();
			await box.save();
		} else {
			return json({ error: 'Box not found' }, { status: 404 });
		}

		return json({ status: 'ok', image: compressedBase64 });
	} catch (error) {
		const status =
			error instanceof PhotoError ? error.status : error instanceof SyntaxError ? 400 : 500;
		return json(
			{ error: status === 500 ? 'Could not save photo' : (error as Error).message },
			{ status }
		);
	}
};
