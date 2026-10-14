import { json } from '@sveltejs/kit';
import Box from '$lib/models/box';
import connectDB from '$lib/db/connect';
import type { RequestHandler } from './$types';
import { storePhoto } from '$lib/server/photo-store';
import { PhotoError, processPhoto } from '$lib/server/photo-processing';

export const PATCH: RequestHandler = async ({ request }) => {
	try {
		const { id, base64 } = await request.json();
		if (typeof id !== 'string' || !id.trim()) {
			return json({ error: 'Provide a valid box ID' }, { status: 400 });
		}
		const processed = await processPhoto(base64);

		await connectDB();
		const box = await Box.findOne({ id: id }).exec();
		if (box) {
			const image = await storePhoto(Buffer.from(processed.split(',')[1], 'base64'));
			if (!box.images.includes(image)) box.images.push(image);
			box.lastModified = Date.now();
			await box.save();
			return json({ status: 'ok', image });
		} else {
			return json({ error: 'Box not found' }, { status: 404 });
		}
	} catch (error) {
		const status =
			error instanceof PhotoError ? error.status : error instanceof SyntaxError ? 400 : 500;
		return json(
			{ error: status === 500 ? 'Could not save photo' : (error as Error).message },
			{ status }
		);
	}
};
