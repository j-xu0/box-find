export type SaveOutcome = 'noop' | 'success' | 'partial' | 'failure';

export type SaveFailure = {
	kind: 'contents' | 'upload' | 'delete';
	message: string;
};

export type SaveWorkflowResult = {
	outcome: SaveOutcome;
	attempted: number;
	succeeded: number;
	contentsSaved: boolean;
	remainingUploads: string[];
	remainingDeletions: string[];
	failures: SaveFailure[];
	uploadedPhotos: { original: string; image: string }[];
};

type SaveWorkflowInput = {
	id: string;
	contents: string;
	contentsChanged: boolean;
	newPhotos: string[];
	delPhotos: string[];
	fetch?: typeof globalThis.fetch;
};

type MutationResult = { ok: true; image?: string } | { ok: false; message: string };

const responseError = async (response: Response) => {
	let detail = '';

	try {
		const body = await response.clone().json();
		detail = body?.details || body?.error || body?.message || '';
	} catch {
		try {
			detail = (await response.text()).trim();
		} catch {
			// A status is still useful when the response body cannot be read.
		}
	}

	return detail ? `${response.status}: ${detail}` : `HTTP ${response.status}`;
};

const mutate = async (
	fetchImpl: typeof globalThis.fetch,
	endpoint: string,
	payload: Record<string, string>
): Promise<MutationResult> => {
	try {
		const response = await fetchImpl(endpoint, {
			method: 'PATCH',
			body: JSON.stringify(payload),
			headers: { 'content-type': 'application/json' }
		});

		if (!response.ok) return { ok: false, message: await responseError(response) };
		if (endpoint === '/api/saveImage') {
			const body = await response.json();
			if (
				typeof body.image !== 'string' ||
				!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(body.image)
			) {
				return { ok: false, message: 'Server did not return the saved photo. Try again.' };
			}
			return { ok: true, image: body.image };
		}
		return { ok: true };
	} catch (error) {
		return {
			ok: false,
			message: error instanceof Error ? error.message : 'Network request failed'
		};
	}
};

export const saveBoxChanges = async ({
	id,
	contents,
	contentsChanged,
	newPhotos,
	delPhotos,
	fetch: fetchImpl = globalThis.fetch
}: SaveWorkflowInput): Promise<SaveWorkflowResult> => {
	// Keep the result tied to the submitted operations, even if callers mutate their queues.
	newPhotos = [...newPhotos];
	delPhotos = [...delPhotos];
	const contentRequest = contentsChanged
		? mutate(fetchImpl, '/api/saveContent', { id, contents })
		: undefined;
	// Sequential uploads keep normal multi-photo saves within server processing capacity.
	const uploadRequests = (async () => {
		const results: MutationResult[] = [];
		for (const base64 of newPhotos)
			results.push(await mutate(fetchImpl, '/api/saveImage', { id, base64 }));
		return results;
	})();
	// Re-adding a photo wins over its queued removal. Wait for processed photo identities
	// before deleting, and clear superseded deletions so retries cannot remove it later.
	const deletionRequests = (async () => {
		const uploads = await uploadRequests;
		const retained = new Set(
			uploads.flatMap((result) => (result.ok && result.image ? [result.image] : []))
		);
		return Promise.all(
			delPhotos.map((base64): Promise<MutationResult> =>
				retained.has(base64)
					? Promise.resolve({ ok: true })
					: mutate(fetchImpl, '/api/delImage', { id, base64 })
			)
		);
	})();

	const [contentResult, uploadResults, deletionResults] = await Promise.all([
		contentRequest,
		uploadRequests,
		deletionRequests
	]);
	const failures: SaveFailure[] = [];

	if (contentResult && !contentResult.ok) {
		failures.push({ kind: 'contents', message: contentResult.message });
	}
	uploadResults.forEach((result) => {
		if (!result.ok) failures.push({ kind: 'upload', message: result.message });
	});
	deletionResults.forEach((result) => {
		if (!result.ok) failures.push({ kind: 'delete', message: result.message });
	});

	const attempted = Number(contentsChanged) + uploadResults.length + deletionResults.length;
	const succeeded = attempted - failures.length;
	const outcome: SaveOutcome =
		attempted === 0
			? 'noop'
			: succeeded === attempted
				? 'success'
				: succeeded === 0
					? 'failure'
					: 'partial';

	return {
		outcome,
		attempted,
		succeeded,
		contentsSaved: contentResult?.ok === true,
		remainingUploads: newPhotos.filter((_, index) => !uploadResults[index]?.ok),
		remainingDeletions: delPhotos.filter((_, index) => !deletionResults[index]?.ok),
		failures,
		uploadedPhotos: uploadResults.flatMap((result, index) =>
			result.ok && result.image ? [{ original: newPhotos[index], image: result.image }] : []
		)
	};
};
