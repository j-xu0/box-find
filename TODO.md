# TODO

## Save workflow

- [x] Finish save error handling in `src/routes/box/[slug]/+page.svelte`: report the API error body, avoid the undefined `error` value, and show one accurate result for mixed content/image saves.
- [x] Fix the success condition. `imgSave` and `imgDel` start at `0`, so a failed content-only save can still display “Changes have been saved.”
- [x] Catch rejected `fetch` calls and always reset `saving` in a `finally` block so network failures do not leave the page stuck in its loading state.
- [x] Retain only failed image uploads/deletions for retry. The current helpers clear the entire pending arrays even when one or more requests fail.
- [x] Fix image-removal bookkeeping in `splicePhoto`: its filter callback does not return a value and marks any removal as a new-photo removal when `newPhotos` is non-empty.
- [x] Allow users to clear all box text. The API currently rejects an empty `contents` string as an invalid request.

## Verification

- [x] Add automated coverage for successful, failed, partial, and no-op saves.

## Tooling

- [x] Replace Prettier with Oxlint and Oxfmt for linting and formatting.
