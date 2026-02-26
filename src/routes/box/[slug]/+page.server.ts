import type { boxData } from '$lib/types/types';
import Box from '$lib/models/box';
import connectDB from '$lib/db/connect';
import type { PageServerLoad } from './$types';
import dotenv from 'dotenv';
dotenv.config();

export const load: PageServerLoad = async ({ params }) => {
	const id = params.slug;
	await connectDB();

	// Use .lean() to get a plain JavaScript object
	const box = await Box.findOne({ id: id }).select('-_id').lean().exec();
	const boxExist = box != null;

	return {
		box: boxExist ? (box as boxData).id : null,
		contents: boxExist && !Array.isArray(box) ? (box as boxData).contents : '',
		images: boxExist && !Array.isArray(box) ? (box as boxData).images : [],
		boxExist: boxExist
	};
};
