// @ts-nocheck -- Bun executes this JavaScript test; TypeScript checks the imported source.
import { describe, expect, test } from 'bun:test';
import { saveBoxChanges } from '../src/lib/save-workflow.ts';

const savedImage = 'data:image/jpeg;base64,YWFh';
const jsonResponse = (body, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});

describe('saveBoxChanges', () => {
	test('reports a successful save and empties completed image queues', async () => {
		const requests = [];
		const fetch = async (endpoint, options) => {
			requests.push([endpoint, JSON.parse(options.body)]);
			return jsonResponse({ status: 'ok', image: savedImage });
		};

		const result = await saveBoxChanges({
			id: 'garage',
			contents: 'tools',
			contentsChanged: true,
			newPhotos: ['new-image'],
			delPhotos: ['old-image'],
			fetch
		});

		expect(result).toMatchObject({
			outcome: 'success',
			attempted: 3,
			succeeded: 3,
			contentsSaved: true,
			remainingUploads: [],
			remainingDeletions: [],
			failures: []
		});
		expect(requests.map(([endpoint]) => endpoint).sort()).toEqual([
			'/api/delImage',
			'/api/saveContent',
			'/api/saveImage'
		]);
	});

	test('reports total failure with server and network error details', async () => {
		const fetch = async (endpoint) => {
			if (endpoint === '/api/saveContent') {
				return jsonResponse({ error: 'Box not found' }, 404);
			}
			throw new Error('connection lost');
		};

		const result = await saveBoxChanges({
			id: 'missing',
			contents: '',
			contentsChanged: true,
			newPhotos: ['new-image'],
			delPhotos: [],
			fetch
		});

		expect(result.outcome).toBe('failure');
		expect(result.succeeded).toBe(0);
		expect(result.contentsSaved).toBe(false);
		expect(result.remainingUploads).toEqual(['new-image']);
		expect(result.failures.map(({ message }) => message)).toEqual([
			'404: Box not found',
			'connection lost'
		]);
	});

	test('reports partial success and retains only failed operations for retry', async () => {
		const fetch = async (endpoint, options) => {
			const { base64 } = JSON.parse(options.body);
			if (endpoint === '/api/saveImage' && base64 === 'bad-upload') {
				return jsonResponse({ details: 'invalid image' }, 500);
			}
			if (endpoint === '/api/delImage' && base64 === 'bad-delete') {
				return new Response('storage unavailable', { status: 503 });
			}
			return jsonResponse({ status: 'ok', image: savedImage });
		};

		const result = await saveBoxChanges({
			id: 'garage',
			contents: 'unchanged',
			contentsChanged: false,
			newPhotos: ['good-upload', 'bad-upload'],
			delPhotos: ['bad-delete', 'good-delete'],
			fetch
		});

		expect(result.outcome).toBe('partial');
		expect(result.succeeded).toBe(2);
		expect(result.remainingUploads).toEqual(['bad-upload']);
		expect(result.remainingDeletions).toEqual(['bad-delete']);
		expect(result.failures.map(({ message }) => message)).toEqual([
			'500: invalid image',
			'503: storage unavailable'
		]);
	});

	test('does not issue a request for a no-op save', async () => {
		let requestCount = 0;
		const result = await saveBoxChanges({
			id: 'garage',
			contents: 'unchanged',
			contentsChanged: false,
			newPhotos: [],
			delPhotos: [],
			fetch: async () => {
				requestCount += 1;
				return jsonResponse({ status: 'ok', image: savedImage });
			}
		});

		expect(result.outcome).toBe('noop');
		expect(result.attempted).toBe(0);
		expect(requestCount).toBe(0);
	});
	test('keeps delayed save results tied to the submitted queues', async () => {
		let complete;
		const delayedResponse = new Promise((resolve) => {
			complete = resolve;
		});
		const newPhotos = ['submitted-upload'];
		const delPhotos = ['submitted-delete'];
		const requests = [];
		const save = saveBoxChanges({
			id: 'garage',
			contents: 'submitted text',
			contentsChanged: true,
			newPhotos,
			delPhotos,
			fetch: async (endpoint, options) => {
				requests.push([endpoint, JSON.parse(options.body)]);
				await delayedResponse;
				return jsonResponse({ error: 'offline' }, 503);
			}
		});
		newPhotos.splice(0, 1, 'later-upload');
		delPhotos.push('later-delete');
		complete();
		const result = await save;
		expect(result.remainingUploads).toEqual(['submitted-upload']);
		expect(result.remainingDeletions).toEqual(['submitted-delete']);
		expect(requests.find(([endpoint]) => endpoint === '/api/saveContent')[1].contents).toBe(
			'submitted text'
		);
	});
});

test('returns canonical photos for immediate deletion and uploads sequentially', async () => {
	let active = 0;
	let maximum = 0;
	const result = await saveBoxChanges({
		id: 'garage',
		contents: '',
		contentsChanged: false,
		newPhotos: ['one', 'two', 'three'],
		delPhotos: [],
		fetch: async () => {
			active++;
			maximum = Math.max(maximum, active);
			await new Promise((resolve) => setTimeout(resolve, 1));
			active--;
			return jsonResponse({ status: 'ok', image: savedImage });
		}
	});
	expect(maximum).toBe(1);
	expect(result.uploadedPhotos).toEqual(
		['one', 'two', 'three'].map((original) => ({ original, image: savedImage }))
	);
});

test('keeps uploads retryable when the server omits canonical identity', async () => {
	const result = await saveBoxChanges({
		id: 'garage',
		contents: '',
		contentsChanged: false,
		newPhotos: ['one'],
		delPhotos: [],
		fetch: async () => jsonResponse({ status: 'ok' })
	});
	expect(result.outcome).toBe('failure');
	expect(result.remainingUploads).toEqual(['one']);
});

test('re-added canonical photo supersedes deletion after its upload settles', async () => {
	let completeUpload;
	const delayedUpload = new Promise((resolve) => {
		completeUpload = resolve;
	});
	const requests = [];
	const otherPhoto = 'data:image/jpeg;base64,YmJi';
	const failedPhoto = 'data:image/jpeg;base64,Y2Nj';
	const save = saveBoxChanges({
		id: 'garage',
		contents: '',
		contentsChanged: false,
		newPhotos: ['original-source'],
		delPhotos: [savedImage, otherPhoto, failedPhoto],
		fetch: async (endpoint, options) => {
			const { base64 } = JSON.parse(options.body);
			requests.push([endpoint, base64]);
			if (endpoint === '/api/saveImage') {
				await delayedUpload;
				return jsonResponse({ status: 'ok', image: savedImage });
			}
			if (base64 === failedPhoto) return jsonResponse({ error: 'storage unavailable' }, 503);
			return jsonResponse({ status: 'ok' });
		}
	});
	await Promise.resolve();
	expect(requests).toEqual([['/api/saveImage', 'original-source']]);
	completeUpload();
	const result = await save;
	expect(requests.filter(([endpoint]) => endpoint === '/api/delImage')).toEqual([
		['/api/delImage', otherPhoto],
		['/api/delImage', failedPhoto]
	]);
	expect(result.remainingUploads).toEqual([]);
	expect(result.remainingDeletions).toEqual([failedPhoto]);
	expect(result.uploadedPhotos).toEqual([{ original: 'original-source', image: savedImage }]);
	expect(result.outcome).toBe('partial');
});

test('failed re-add keeps upload retryable and still performs the requested deletion', async () => {
	let completeUpload;
	const delayedUpload = new Promise((resolve) => {
		completeUpload = resolve;
	});
	const requests = [];
	const save = saveBoxChanges({
		id: 'garage',
		contents: '',
		contentsChanged: false,
		newPhotos: ['original-source'],
		delPhotos: [savedImage],
		fetch: async (endpoint) => {
			requests.push(endpoint);
			if (endpoint === '/api/saveImage') {
				await delayedUpload;
				return jsonResponse({ error: 'offline' }, 503);
			}
			return jsonResponse({ status: 'ok' });
		}
	});
	await Promise.resolve();
	expect(requests).toEqual(['/api/saveImage']);
	completeUpload();
	const result = await save;
	expect(requests).toEqual(['/api/saveImage', '/api/delImage']);
	expect(result.remainingUploads).toEqual(['original-source']);
	expect(result.remainingDeletions).toEqual([]);
	expect(result.uploadedPhotos).toEqual([]);
	expect(result.outcome).toBe('partial');
});
