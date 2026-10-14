import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { crc32 } from 'node:zlib';
import * as yauzl from 'yauzl';
import { ZipFile } from 'yazl';
import { MAX_PHOTO_BYTES } from '../photos';
import { decodePhoto } from './photo-processing';

export const MAX_BACKUP_BYTES = 50_000_000;
const MAX_MANIFEST_BYTES = 5_000_000;
const MAX_ENTRIES = 10_000;
const PHOTO_KEY = /^[a-f0-9]{64}\.jpg$/;
const PHOTO_FILE = /^photos\/([a-f0-9]{64})\.(jpg|png|webp|gif|tiff)$/;
const EXTENSIONS: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/jpg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/gif': 'gif',
	'image/tiff': 'tiff'
};

export class BackupError extends Error {
	constructor(
		message: string,
		public status = 400
	) {
		super(message);
	}
}

export type BackupBox = { id: string; contents: string; images: string[]; lastModified: string };
type PhotoReference = { file: string; storage: 'garage' | 'inline'; mediaType: string };
type Manifest = { version: 2; boxes: (Omit<BackupBox, 'images'> & { images: PhotoReference[] })[] };
type PhotoReader = (key: string) => Promise<Buffer>;
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

export function garageKey(image: string): string | undefined {
	const key = image.startsWith('/photos/') ? image.slice('/photos/'.length) : '';
	return PHOTO_KEY.test(key) ? key : undefined;
}

function sizeLimit(max: number) {
	let size = 0;
	return new Transform({
		transform(chunk, _encoding, callback) {
			size += chunk.length;
			callback(size > max ? new BackupError('Backup exceeds its size limit', 413) : null, chunk);
		}
	});
}

export async function readBounded(source: AsyncIterable<Uint8Array>, max: number): Promise<Buffer> {
	const chunks: Buffer[] = [];
	let size = 0;
	for await (const chunk of source) {
		size += chunk.length;
		if (size > max) throw new BackupError('Backup entry exceeds its size limit', 413);
		chunks.push(Buffer.from(chunk));
	}
	return Buffer.concat(chunks, size);
}

export async function temporaryArchive() {
	const directory = await mkdtemp(join(tmpdir(), 'box-find-backup-'));
	return {
		path: join(directory, 'backup.zip'),
		cleanup: () => rm(directory, { recursive: true, force: true })
	};
}

export async function* streamChunks(body: ReadableStream<Uint8Array>) {
	const reader = body.getReader();
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			yield value;
		}
	} finally {
		await reader.cancel();
		reader.releaseLock();
	}
}

export async function spoolArchive(body: ReadableStream<Uint8Array> | null, path: string) {
	if (!body) throw new BackupError('Provide a ZIP request body');
	await pipeline(
		Readable.from(streamChunks(body)),
		sizeLimit(MAX_BACKUP_BYTES),
		createWriteStream(path)
	);
}

// Finish the temporary ZIP before sending HTTP headers: missing objects must fail the export.
export async function createBackup(boxes: BackupBox[], readPhoto: PhotoReader) {
	const archive = await temporaryArchive();
	try {
		const sources = new Map<string, () => Promise<Buffer>>();
		let inlineSize = 0;
		const manifest: Manifest = {
			version: 2,
			boxes: boxes.map((box) => ({
				...box,
				images: box.images.map((image) => {
					const key = garageKey(image);
					if (key) {
						const file = `photos/${key}`;
						sources.set(file, () => readPhoto(key));
						return { file, storage: 'garage', mediaType: 'image/jpeg' };
					}
					const mediaType = /^data:(image\/[a-z]+);base64,/.exec(image)?.[1];
					if (!mediaType || !EXTENSIONS[mediaType])
						throw new BackupError('Box contains an unsupported photo');
					inlineSize += image.length;
					const file = `photos/${hash(decodePhoto(image))}.${EXTENSIONS[mediaType]}`;
					if (!sources.has(file)) sources.set(file, async () => decodePhoto(image));
					return { file, storage: 'inline', mediaType };
				})
			}))
		};
		const metadata = Buffer.from(JSON.stringify(manifest));
		if (
			metadata.length > MAX_MANIFEST_BYTES ||
			sources.size + 1 > MAX_ENTRIES ||
			boxes.length > MAX_ENTRIES
		)
			throw new BackupError('Backup contains too many records or photos', 413);
		if (metadata.length + inlineSize > MAX_BACKUP_BYTES)
			throw new BackupError('Restored inline records exceed the backup size limit', 413);
		const zip = new ZipFile();
		const output = createWriteStream(archive.path);
		const fail = (error: Error) => output.destroy(error);
		zip.on('error', fail);
		const completion = pipeline(zip.outputStream, sizeLimit(MAX_BACKUP_BYTES), output);
		zip.addBuffer(metadata, 'manifest.json', { compress: true });
		let expanded = metadata.length;
		for (const [file, read] of sources) {
			zip.addReadStreamLazy(file, { compress: false }, (callback) => {
				void (async () => {
					const bytes = await read();
					if (!bytes.length || bytes.length > MAX_PHOTO_BYTES)
						throw new BackupError('Photo exceeds its size limit', 413);
					if (hash(bytes) !== PHOTO_FILE.exec(file)![1])
						throw new BackupError('Photo content does not match its hash');
					expanded += bytes.length;
					if (expanded > MAX_BACKUP_BYTES)
						throw new BackupError('Backup exceeds its size limit', 413);
					callback(null, Readable.from([bytes]));
				})().catch((error) => callback(error, Readable.from([])));
			});
		}
		zip.end();
		await completion;
		return archive;
	} catch (error) {
		await archive.cleanup();
		throw error;
	}
}

export function archiveResponse(archive: Awaited<ReturnType<typeof temporaryArchive>>) {
	const stream = createReadStream(archive.path);
	stream.once('close', () => {
		void archive.cleanup();
	});
	return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
		headers: {
			'Content-Type': 'application/zip',
			'Content-Disposition': 'attachment; filename="box-find-backup.zip"',
			'Cache-Control': 'no-store'
		}
	});
}

function validateBoxes(value: unknown): BackupBox[] {
	if (!Array.isArray(value) || value.length > MAX_ENTRIES)
		throw new BackupError('Provide an array of boxes');
	const ids = new Set<string>();
	for (const box of value) {
		if (
			!box ||
			typeof box.id !== 'string' ||
			!box.id.trim() ||
			(box.contents !== undefined && typeof box.contents !== 'string') ||
			!Array.isArray(box.images) ||
			box.images.length > MAX_ENTRIES
		)
			throw new BackupError('Invalid box record');
		if (ids.has(box.id)) throw new BackupError(`Duplicate box ID: ${box.id}`, 409);
		ids.add(box.id);
	}
	return value;
}

function validateManifest(value: unknown): Manifest {
	const manifest = value as Manifest;
	if (!manifest || manifest.version !== 2) throw new BackupError('Unsupported backup version');
	validateBoxes(manifest.boxes);
	for (const box of manifest.boxes) {
		if (typeof box.lastModified !== 'string' || !Number.isFinite(Date.parse(box.lastModified)))
			throw new BackupError('Invalid box timestamp');
		for (const photo of box.images) {
			if (
				!photo ||
				typeof photo.file !== 'string' ||
				!PHOTO_FILE.test(photo.file) ||
				typeof photo.mediaType !== 'string' ||
				!Object.hasOwn(EXTENSIONS, photo.mediaType) ||
				!photo.file.endsWith(`.${EXTENSIONS[photo.mediaType]}`) ||
				(photo.storage !== 'inline' && photo.storage !== 'garage') ||
				(photo.storage === 'garage' && photo.mediaType !== 'image/jpeg')
			)
				throw new BackupError('Invalid photo reference');
		}
	}
	return manifest;
}

export async function openBackup(path: string) {
	let zip: yauzl.ZipFile;
	try {
		zip = await yauzl.openPromise(path, {
			lazyEntries: true,
			autoClose: false,
			strictFileNames: true
		});
	} catch {
		throw new BackupError('Invalid ZIP backup');
	}
	try {
		if (zip.fileSize > MAX_BACKUP_BYTES || zip.entryCount > MAX_ENTRIES)
			throw new BackupError('Backup exceeds its size limit', 413);
		const entries = new Map<string, yauzl.Entry>();
		let expanded = 0;
		for await (const entry of zip.eachEntry()) {
			if (
				entries.has(entry.fileName) ||
				(entry.fileName !== 'manifest.json' && !PHOTO_FILE.test(entry.fileName))
			)
				throw new BackupError('Unexpected or duplicate ZIP entry');
			const limit = entry.fileName === 'manifest.json' ? MAX_MANIFEST_BYTES : MAX_PHOTO_BYTES;
			expanded += entry.uncompressedSize;
			if (!entry.uncompressedSize || entry.uncompressedSize > limit || expanded > MAX_BACKUP_BYTES)
				throw new BackupError('Backup entry exceeds its size limit', 413);
			if (entry.isEncrypted() || ![0, 8].includes(entry.compressionMethod))
				throw new BackupError('Unsupported ZIP entry encoding');
			entries.set(entry.fileName, entry);
		}
		async function read(file: string) {
			const entry = entries.get(file);
			if (!entry) throw new BackupError(`Missing backup entry: ${file}`);
			const bytes = await readBounded(
				await zip.openReadStreamPromise(entry),
				entry.uncompressedSize
			);
			if (crc32(bytes) !== entry.crc32) throw new BackupError(`Corrupt backup entry: ${file}`);
			if (file !== 'manifest.json' && hash(bytes) !== PHOTO_FILE.exec(file)![1])
				throw new BackupError(`Photo hash mismatch: ${file}`);
			return bytes;
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse((await read('manifest.json')).toString('utf8'));
		} catch (error) {
			if (error instanceof BackupError) throw error;
			throw new BackupError('Invalid backup manifest');
		}
		const manifest = validateManifest(parsed);
		// Shared inline photos expand back into each MongoDB reference. Bound that expansion too.
		let restoredSize = JSON.stringify(manifest).length;
		for (const box of manifest.boxes) {
			for (const photo of box.images) {
				const entry = entries.get(photo.file);
				if (!entry) throw new BackupError(`Missing backup entry: ${photo.file}`);
				if (photo.storage === 'inline')
					restoredSize += 4 * Math.ceil(entry.uncompressedSize / 3) + 40;
			}
		}
		if (restoredSize > MAX_BACKUP_BYTES)
			throw new BackupError('Restored inline records exceed the backup size limit', 413);
		const referenced = new Set(
			manifest.boxes.flatMap((box) => box.images.map((photo) => photo.file))
		);
		if (entries.size !== referenced.size + 1)
			throw new BackupError('Backup contains missing or unreferenced photos');
		// Validate every photo before any Garage or MongoDB writes. Read one entry at a time.
		for (const file of referenced) await read(file);
		return { manifest, read, close: () => zip.close() };
	} catch (error) {
		zip.close();
		throw error instanceof BackupError ? error : new BackupError('Invalid ZIP backup');
	}
}

export async function restoreBackup(
	backup: Awaited<ReturnType<typeof openBackup>>,
	storePhoto: (bytes: Buffer) => Promise<string>
): Promise<BackupBox[]> {
	const urls = new Map<string, string>();
	for (const box of backup.manifest.boxes) {
		for (const photo of box.images) {
			if (photo.storage === 'garage' && !urls.has(photo.file)) {
				const url = await storePhoto(await backup.read(photo.file));
				if (url !== `/photos/${photo.file.slice('photos/'.length)}`)
					throw new BackupError('Restored photo identity changed', 500);
				urls.set(photo.file, url);
			}
		}
	}
	const boxes: BackupBox[] = [];
	for (const box of backup.manifest.boxes) {
		const images: string[] = [];
		for (const photo of box.images) {
			images.push(
				photo.storage === 'garage'
					? urls.get(photo.file)!
					: `data:${photo.mediaType};base64,${(await backup.read(photo.file)).toString('base64')}`
			);
		}
		boxes.push({
			id: box.id,
			contents: box.contents ?? '',
			images,
			lastModified: box.lastModified
		});
	}
	return boxes;
}

export async function legacyImport(value: unknown, readPhoto: PhotoReader): Promise<BackupBox[]> {
	const boxes = validateBoxes(value);
	const checked = new Set<string>();
	for (const box of boxes) {
		for (const image of box.images) {
			if (typeof image !== 'string') throw new BackupError('Invalid photo reference');
			const key = garageKey(image);
			if (key) {
				if (!checked.has(key)) {
					try {
						if (hash(await readPhoto(key)) !== key.slice(0, -4)) throw new Error('Hash mismatch');
					} catch {
						throw new BackupError(
							`Photo ${key} is unavailable; import a ZIP backup containing its bytes`
						);
					}
					checked.add(key);
				}
			} else {
				decodePhoto(image);
			}
		}
	}
	return boxes.map((box) => ({
		id: box.id,
		contents: box.contents ?? '',
		images: box.images,
		lastModified: new Date().toISOString()
	}));
}
