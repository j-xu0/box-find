import { json } from '@sveltejs/kit';
import Box from '$lib/models/box';
import connectDB from '$lib/db/connect';
import type { RequestHandler } from './$types';
import { archiveResponse, BackupError, createBackup } from '$lib/server/backups';
import { readBackupPhoto } from '$lib/server/backup-storage';

export const GET: RequestHandler = async () => {
	try {
		await connectDB();
		const records = await Box.find({}).select('id contents images lastModified -_id').lean().exec();
		const boxes = records.map((box) => ({
			id: box.id as string,
			contents: (box.contents ?? '') as string,
			images: (box.images ?? []) as string[],
			lastModified: new Date(box.lastModified as string).toISOString()
		}));
		return archiveResponse(await createBackup(boxes, readBackupPhoto));
	} catch (error) {
		console.error('Backup export failed:', error);
		return json(
			{ error: 'Backup export failed; no complete backup was produced' },
			{ status: error instanceof BackupError ? error.status : 503 }
		);
	}
};
