import Box from '$lib/models/box';
import connectDB from '$lib/db/connect';
import type { PageServerLoad } from './$types';
import dotenv from 'dotenv';
dotenv.config();

export const load: PageServerLoad = async () => {
	let lastPage;
	let contents;

	await connectDB();

	const count = await Box.countDocuments();
	lastPage = Math.ceil(count / 10);

	const boxes = await Box.find({}, 'id images contents')
		.sort({ lastModified: -1 })
		.limit(10)
		.select('-_id')
		.lean()
		.exec();

	contents = boxes.map(({ _id, ...box }) => {
		if (box.images.length > 5) {
			box.images = box.images.slice(0, 5);
		}
		return box;
	});

	return {
		contents: contents,
		lastPage: lastPage
	};
};
