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
};

type SaveWorkflowInput = {
	id: string;
	contents: string;
	contentsChanged: boolean;
	newPhotos: string[];
	delPhotos: string[];
	fetch?: typeof globalThis.fetch;
};

type MutationResult = { ok: true } | { ok: false; message: string };

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

		return response.ok ? { ok: true } : { ok: false, message: await responseError(response) };
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
	const contentRequest = contentsChanged
		? mutate(fetchImpl, '/api/saveContent', { id, contents })
		: undefined;
	const uploadRequests = newPhotos.map((base64) =>
		mutate(fetchImpl, '/api/saveImage', { id, base64 })
	);
	const deletionRequests = delPhotos.map((base64) =>
		mutate(fetchImpl, '/api/delImage', { id, base64 })
	);

	const [contentResult, uploadResults, deletionResults] = await Promise.all([
		contentRequest,
		Promise.all(uploadRequests),
		Promise.all(deletionRequests)
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
		failures
	};
};
