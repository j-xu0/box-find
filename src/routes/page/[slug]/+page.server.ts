import Box from '$lib/models/box';
import connectDB from '$lib/db/connect';
import type { PageServerLoad } from './$types';
import dotenv from 'dotenv';
import { redirect } from '@sveltejs/kit';
dotenv.config();

export const load: PageServerLoad = async ({ params }) => {
	//check if the page is a number, if not redirect to home
	const regex = /^[0-9]+$/;
	if (!regex.test(params.slug)) redirect(307, `/`);
	let page = parseInt(params.slug);
	if (page == 0) redirect(307, `/`);
	let lastPage;
	let contents;

	await connectDB();

	const count = await Box.countDocuments();
	lastPage = Math.ceil(count / 10);
	if (page > lastPage) {
		page = lastPage;
		redirect(307, `/page/${page}`);
	}

	const boxes = await Box.find({}, 'id images contents')
		.sort({ lastModified: -1 })
		.skip((page - 1) * 10)
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
		page: page,
		lastPage: lastPage
	};
};
