import { json } from '@sveltejs/kit';
import Box from '$lib/models/box';
import connectDB from '$lib/db/connect';
import type { RequestHandler } from './$types';
import {
	BackupError,
	legacyImport,
	openBackup,
	restoreBackup,
	spoolArchive,
	temporaryArchive
} from '$lib/server/backups';
import { readBackupPhoto } from '$lib/server/backup-storage';
import { PhotoError } from '$lib/server/photo-processing';
import { storePhoto } from '$lib/server/photo-store';

async function checkConflicts(ids: string[]) {
	const conflict = await Box.findOne({ id: { $in: ids } })
		.select('id')
		.lean<{ id: string }>()
		.exec();
	if (conflict) throw new BackupError(`Box already exists: ${conflict.id}`, 409);
}

export const POST: RequestHandler = async ({ request }) => {
	let archive: Awaited<ReturnType<typeof temporaryArchive>> | undefined;
	let backup: Awaited<ReturnType<typeof openBackup>> | undefined;
	const imported: string[] = [];
	try {
		await connectDB();
		const contentType = request.headers.get('content-type')?.split(';')[0].trim();
		let boxes;
		if (contentType === 'application/zip' || contentType === 'application/octet-stream') {
			archive = await temporaryArchive();
			await spoolArchive(request.body, archive.path);
			backup = await openBackup(archive.path);
			await checkConflicts(backup.manifest.boxes.map((box) => box.id));
			boxes = await restoreBackup(backup, storePhoto);
		} else if (contentType === 'application/json') {
			const body = await request.json();
			boxes = await legacyImport(body?.importObj, readBackupPhoto);
			await checkConflicts(boxes.map((box) => box.id));
		} else {
			throw new BackupError('Use application/zip or application/json', 415);
		}
		// Standalone MongoDB has no cross-store transaction. Report completed IDs if an insert fails.
		for (const box of boxes) {
			await Box.create(box);
			imported.push(box.id);
		}
		return json({ status: 'ok', imported });
	} catch (error) {
		const duplicate = (error as { code?: number }).code === 11000;
		const status =
			error instanceof BackupError || error instanceof PhotoError
				? error.status
				: error instanceof SyntaxError
					? 400
					: duplicate
						? 409
						: 500;
		return json(
			{
				error: status < 500 ? (error as Error).message : 'Backup import failed',
				imported
			},
			{ status }
		);
	} finally {
		backup?.close();
		await archive?.cleanup();
	}
};
