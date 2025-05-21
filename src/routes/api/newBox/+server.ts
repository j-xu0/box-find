import { json } from '@sveltejs/kit';
import createBox from '$lib/db/create';
import Box from '$lib/models/box';
import connectDB from '$lib/db/connect';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const { id } = await request.json();

	if (process.env.ENVIRONMENT === 'DEMO') {
		return json(
			{
				error: 'This action is not allowed in demo mode'
			},
			{ status: 403 }
		);
	}

	await connectDB();
	let insertedDoc = await createBox({ _id: id, contents: '', images: [] }).catch((e) => {
		return json(
			{ error: 'Unexpected Server Error', details: (e as Error).message },
			{ status: 500 }
		);
	});

	if (insertedDoc instanceof Response) {
		return insertedDoc;
	}
	let res = json({ id: insertedDoc._id }, { status: 201 });
	return res;
};
