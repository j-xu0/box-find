import { json } from '@sveltejs/kit';
import Box from '$lib/models/box';
import connectDB from '$lib/db/connect';
import type { RequestHandler } from './$types';
import sharp from 'sharp';

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

	if (!id || !base64) {
		return json({ error: 'Missing id or base64' }, { status: 400 });
	}

	try {
		const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');
		const imageBuffer = Buffer.from(base64Data, 'base64');

		const compressedBuffer = await sharp(imageBuffer)
			.withMetadata()
			.resize(6500, 6500, { fit: 'inside' })
			.jpeg({ quality: 75 })
			.toBuffer();

		const compressedBase64 = `data:image/jpeg;base64,${compressedBuffer.toString('base64')}`;

		await connectDB();
		const box = await Box.findOne({ id: id }).exec();
		if (box) {
			box.images.push(compressedBase64);
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
