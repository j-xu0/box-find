import { json } from '@sveltejs/kit';
import Box from '$lib/models/box';
import connectDB from '$lib/db/connect';
import type { RequestHandler } from './$types';
import { fuzzyFilter } from 'fuzzbunny';

export const GET: RequestHandler = async ({ url }) => {
	const query = decodeURIComponent(url.searchParams.get('query') || '');
	if (!query) return json({ error: 'No query provided' }, { status: 400 });
	await connectDB();

	let contents = await Box.find({}, { id: 1, contents: 1, images: 1 }).select('-_id');
	let res;

	res = fuzzyFilter(contents, query, { fields: ['id', 'contents'] });

	return json(res);
};
