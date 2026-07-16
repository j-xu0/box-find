import type { boxData as BoxData } from '$lib/types/types';
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
	const boxData = box as unknown as BoxData | null;

	return {
		box: boxData?.id ?? null,
		contents: boxData?.contents ?? '',
		images: boxData?.images ?? [],
		boxExist: boxExist
	};
};
