// @ts-nocheck -- Bun executes the backup fixtures; TypeScript checks the source.
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { readFile, writeFile, access } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { expect, test } from 'bun:test';
import sharp from 'sharp';
import { ZipFile } from 'yazl';
import * as yauzl from 'yauzl';
import {
	archiveResponse,
	createBackup,
	legacyImport,
	MAX_BACKUP_BYTES,
	openBackup,
	readBounded,
	restoreBackup,
	spoolArchive,
	temporaryArchive
} from '../src/lib/server/backups.ts';
import { MAX_PHOTO_BYTES } from '../src/lib/photos.ts';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const key = (bytes) => `${hash(bytes)}.jpg`;
const timestamp = '2026-10-14T12:00:00.000Z';
const box = (id, images = []) => ({ id, contents: 'Tools', images, lastModified: timestamp });
const reference = (bytes) => ({
	file: `photos/${key(bytes)}`,
	storage: 'garage',
	mediaType: 'image/jpeg'
});
const fixture = async () => {
	const png = await sharp({ create: { width: 20, height: 10, channels: 3, background: '#123456' } })
		.png()
		.toBuffer();
	return { png, jpeg: await sharp(png).jpeg().toBuffer() };
};

async function makeArchive(manifest, files = []) {
	const archive = await temporaryArchive();
	const zip = new ZipFile();
	const completion = pipeline(zip.outputStream, createWriteStream(archive.path));
	zip.addBuffer(Buffer.from(JSON.stringify(manifest)), 'manifest.json');
	for (const [name, bytes, options = {}] of files) zip.addBuffer(bytes, name, options);
	zip.end();
	await completion;
	return archive;
}

test('ZIP round trip restores exact bytes, timestamps, inline types, and shared objects', async () => {
	const { png, jpeg } = await fixture();
	const inlinePng = `data:image/png;base64,${png.toString('base64')}`;
	const inlineJpeg = `data:image/jpeg;base64,${jpeg.toString('base64')}`;
	const url = `/photos/${key(jpeg)}`;
	const boxes = [box('one', [url, inlinePng, inlineJpeg]), box('two', [url])];
	let reads = 0;
	const archive = await createBackup(boxes, async (requested) => {
		expect(requested).toBe(key(jpeg));
		reads++;
		return jpeg;
	});
	let backup;
	try {
		expect(reads).toBe(1);
		const zip = await yauzl.openPromise(archive.path, { lazyEntries: true });
		const entries = [];
		for await (const entry of zip.eachEntry()) entries.push(entry);
		expect(entries).toHaveLength(3);
		expect(
			entries
				.filter((entry) => entry.fileName.startsWith('photos/'))
				.every((entry) => entry.compressionMethod === 0)
		).toBe(true);
		backup = await openBackup(archive.path);
		expect(JSON.stringify(backup.manifest)).not.toContain('base64');
		const objects = new Map();
		const restored = await restoreBackup(backup, async (bytes) => {
			expect(bytes.equals(jpeg)).toBe(true);
			objects.set(key(bytes), bytes);
			return `/photos/${key(bytes)}`;
		});
		expect(restored).toEqual(boxes);
		expect(objects.size).toBe(1);
	} finally {
		backup?.close();
		await archive.cleanup();
	}
});

test('empty inventories and boxes without photos round trip', async () => {
	for (const boxes of [[], [box('empty')]]) {
		const archive = await createBackup(boxes, async () => {
			throw new Error('Unexpected read');
		});
		const backup = await openBackup(archive.path);
		try {
			expect(
				await restoreBackup(backup, async () => {
					throw new Error('Unexpected upload');
				})
			).toEqual(boxes);
		} finally {
			backup.close();
			await archive.cleanup();
		}
	}
});

test('export fails when a referenced Garage photo is missing or has changed', async () => {
	const { jpeg } = await fixture();
	await expect(
		createBackup([box('one', [`/photos/${key(jpeg)}`])], async () => {
			throw new Error('NoSuchKey');
		})
	).rejects.toThrow('NoSuchKey');
	await expect(
		createBackup([box('one', [`/photos/${key(jpeg)}`])], async () => Buffer.from('different'))
	).rejects.toThrow('hash');
});

test('rejects invalid versions, records, references, missing photos, and unexpected entries', async () => {
	const { jpeg } = await fixture();
	const ref = reference(jpeg);
	const valid = { version: 2, boxes: [box('one', [ref])] };
	const cases = [
		[{ version: 3, boxes: [] }, []],
		[{ version: 2, boxes: [box('one'), box('one')] }, []],
		[{ version: 2, boxes: [{ ...box('one'), lastModified: 'invalid' }] }, []],
		[{ version: 2, boxes: [box('one', [{ ...ref, file: '../photo.jpg' }])] }, []],
		[valid, []],
		[{ version: 2, boxes: [] }, [[ref.file, jpeg]]],
		[
			valid,
			[
				[ref.file, jpeg],
				[ref.file, jpeg]
			]
		],
		[{ version: 2, boxes: [] }, [['unexpected.bin', jpeg]]],
		[valid, [[ref.file, Buffer.from('wrong bytes')]]]
	];
	for (const [manifest, files] of cases) {
		const archive = await makeArchive(manifest, files);
		try {
			await expect(openBackup(archive.path)).rejects.toMatchObject({ status: expect.any(Number) });
		} finally {
			await archive.cleanup();
		}
	}
});

test('rejects a photo with a corrupt ZIP checksum before restore', async () => {
	const { jpeg } = await fixture();
	const ref = reference(jpeg);
	const archive = await makeArchive({ version: 2, boxes: [box('one', [ref])] }, [
		[ref.file, jpeg, { compress: false }]
	]);
	try {
		const bytes = await readFile(archive.path);
		bytes[bytes.indexOf(jpeg) + 10] ^= 1;
		await writeFile(archive.path, bytes);
		await expect(openBackup(archive.path)).rejects.toThrow('Corrupt backup entry');
	} finally {
		await archive.cleanup();
	}
});

test('rejects oversized compressed photos before inflation', async () => {
	const bytes = Buffer.alloc(MAX_PHOTO_BYTES + 1);
	const ref = reference(bytes);
	const archive = await makeArchive({ version: 2, boxes: [box('one', [ref])] }, [
		[ref.file, bytes]
	]);
	try {
		await expect(openBackup(archive.path)).rejects.toMatchObject({ status: 413 });
	} finally {
		await archive.cleanup();
	}
});

test('legacy JSON accepts inline photos and verifies destination Garage references', async () => {
	const { png, jpeg } = await fixture();
	const inline = `data:image/png;base64,${png.toString('base64')}`;
	const url = `/photos/${key(jpeg)}`;
	const result = await legacyImport(
		[box('one', [inline, url]), box('two', [url])],
		async () => jpeg
	);
	expect(result[0].images).toEqual([inline, url]);
	await expect(
		legacyImport([box('one', [url])], async () => {
			throw new Error('NoSuchKey');
		})
	).rejects.toThrow('ZIP backup');
	await expect(
		legacyImport([box('one', ['https://example.com/photo'])], async () => jpeg)
	).rejects.toThrow();
	await expect(legacyImport([box('one'), box('one')], async () => jpeg)).rejects.toMatchObject({
		status: 409
	});
});

test('limits expansion of shared inline references during restoration', async () => {
	const bytes = Buffer.alloc(8 * 1024 * 1024);
	const ref = { ...reference(bytes), storage: 'inline' };
	const archive = await makeArchive(
		{
			version: 2,
			boxes: [
				box(
					'one',
					Array.from({ length: 5 }, () => ({ ...ref }))
				)
			]
		},
		[[ref.file, bytes]]
	);
	try {
		await expect(openBackup(archive.path)).rejects.toMatchObject({ status: 413 });
	} finally {
		await archive.cleanup();
	}
});

test('upload failure stops restore without returning boxes for insertion', async () => {
	const { jpeg } = await fixture();
	const archive = await createBackup([box('one', [`/photos/${key(jpeg)}`])], async () => jpeg);
	const backup = await openBackup(archive.path);
	try {
		await expect(
			restoreBackup(backup, async () => {
				throw new Error('Storage unavailable');
			})
		).rejects.toThrow('Storage unavailable');
	} finally {
		backup.close();
		await archive.cleanup();
	}
});

test('request spooling and entry reads enforce byte limits', async () => {
	const archive = await temporaryArchive();
	let cancelled = false;
	const request = new ReadableStream({
		pull(controller) {
			controller.enqueue(new Uint8Array(1024 * 1024));
		},
		cancel() {
			cancelled = true;
		}
	});
	try {
		await expect(spoolArchive(request, archive.path)).rejects.toMatchObject({ status: 413 });
		expect(cancelled).toBe(true);
		expect((await readFile(archive.path)).length).toBeLessThanOrEqual(MAX_BACKUP_BYTES);
		await expect(
			readBounded(
				(async function* () {
					yield Buffer.alloc(3);
					yield Buffer.alloc(3);
				})(),
				5
			)
		).rejects.toMatchObject({ status: 413 });
	} finally {
		await archive.cleanup();
	}
});

test('download response sends a usable ZIP and removes its temporary file', async () => {
	const archive = await createBackup([box('one')], async () => {
		throw new Error('Unexpected read');
	});
	const response = archiveResponse(archive);
	expect(response.headers.get('content-type')).toBe('application/zip');
	expect(
		Buffer.from(await response.arrayBuffer())
			.subarray(0, 2)
			.toString()
	).toBe('PK');
	for (let attempt = 0; attempt < 100; attempt++) {
		try {
			await access(archive.path);
		} catch {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 5));
	}
	throw new Error('Temporary archive was not removed');
});
