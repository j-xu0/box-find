// @ts-nocheck -- Bun executes processing regression fixtures.
import { expect, test } from 'bun:test';
import sharp from 'sharp';
import { processPhoto, decodePhoto } from '../src/lib/server/photo-processing.ts';

const inline = (bytes) => 'data:image/png;base64,' + bytes.toString('base64');
const fixture = (width, height) =>
	sharp({ create: { width, height, channels: 3, background: '#336699' } })
		.png()
		.toBuffer();

test('small photos stay small and produce deterministic JPEG data', async () => {
	const image = inline(await fixture(100, 50));
	const output = await processPhoto(image);
	expect(output.startsWith('data:image/jpeg;base64,')).toBe(true);
	expect(await processPhoto(image)).toBe(output);
	const metadata = await sharp(decodePhoto(output)).metadata();
	expect([metadata.width, metadata.height]).toEqual([100, 50]);
});

test('fits large photos within 2400 pixels', async () => {
	const metadata = await sharp(
		decodePhoto(await processPhoto(inline(await fixture(3000, 1000))))
	).metadata();
	expect([metadata.width, metadata.height]).toEqual([2400, 800]);
});

test('autorotates and strips EXIF metadata', async () => {
	const bytes = await sharp(await fixture(100, 50))
		.withMetadata({ orientation: 6 })
		.jpeg()
		.toBuffer();
	const output = await processPhoto('data:image/jpeg;base64,' + bytes.toString('base64'));
	const metadata = await sharp(decodePhoto(output)).metadata();
	expect([metadata.width, metadata.height]).toEqual([50, 100]);
	expect(metadata.exif).toBeUndefined();
	expect(metadata.orientation).toBeUndefined();
});

test('rejects invalid and oversized uploads', async () => {
	await expect(processPhoto('data:image/png;base64,YmFk')).rejects.toMatchObject({ status: 400 });
	expect(() => decodePhoto('data:image/png;base64,' + 'a'.repeat(15000000))).toThrow('10 MiB');
	await expect(processPhoto(inline(await fixture(5100, 5000)))).rejects.toMatchObject({
		status: 400
	});
});

test('excess concurrent processing returns a retryable error', async () => {
	const image = inline(await fixture(100, 50));
	const results = await Promise.allSettled([
		processPhoto(image),
		processPhoto(image),
		processPhoto(image)
	]);
	expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(2);
	expect(results.find((result) => result.status === 'rejected').reason.status).toBe(503);
});
