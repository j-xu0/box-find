# Box Find

A SvelteKit-based box storage organizer using shadcn-svelte, Tailwind CSS, sharp, fuzzbunny, and MongoDB.

## Development

Requires Bun, Docker with Docker Compose, GNU Make, and Linux `setsid` and `flock` (from util-linux).

```sh
make start
```

This installs locked dependencies, starts local MongoDB and Garage through `compose.dev.yaml`, waits for
the services to become healthy, and starts the Bun/Vite dev server in the background with hot reload
at http://127.0.0.1:5173. Use `make logs` to follow app output.

```sh
make stop
```

This stops the managed Bun process and removes the dev containers/network. MongoDB and photo data stay
in the `box-find-dev_mongodb-data`, `box-find-dev_garage-meta`, and `box-find-dev_garage-data` Docker volumes and is reused on the next start. Running
`make start` again while the app is running does not launch another app process.
Overlapping start/stop commands are serialized with a shared lifecycle lock.

Dev MongoDB is available at `mongodb://127.0.0.1:27018/boxes-dev`. `make start` sets this URI
for the app even if your `.env` contains a remote `MONGO_URI`; it does not edit `.env`.
The database starts empty, uses no authentication, and is exposed only on localhost.
Other `.env` settings still apply, including `ENVIRONMENT=DEMO` if configured.

To inspect Mongo logs, run `docker compose -f compose.dev.yaml logs -f mongodb`.
To **delete all local dev data**, stop the app and explicitly run
`docker compose -f compose.dev.yaml down --volumes`.

The dev setup is separate from the deployment Compose file below. New photos are processed by
Sharp, stored as JPEG objects in Garage, and referenced by `/photos/<hash>.jpg` URLs in MongoDB.
The app serves these URLs through Garage's private S3 API; browser clients never receive S3 keys.
Garage is available locally at `http://127.0.0.1:3900`. `make start` configures the app endpoint
and credentials automatically. No existing photos are migrated.

Both Compose files run Garage v2.4.1 with automatic single-node and `photos` bucket setup
([Garage quick start](https://garagehq.deuxfleurs.fr/documentation/quick-start/)).
For deployment, set `GARAGE_RPC_SECRET` (64 hex characters), `PHOTO_ACCESS_KEY` (`GK` followed
by 32 hex characters), and `PHOTO_SECRET_KEY` (64 hex characters) in the Compose environment.
The built-in credentials are local development defaults. Keep these values stable across restarts.
The deployment S3 port is internal to Docker. Back up both Garage volumes alongside MongoDB;
this single-node setup has no replication.

Identical processed photos share one object. Removing a photo or box removes its MongoDB
reference; Garage objects are retained so shared references and imported backups remain valid.

## Portable backups

`GET /api/export` downloads a self-contained ZIP, replacing the previous JSON array response.
It contains a version 2 `manifest.json` and one `photos/<sha256>.<extension>` file per unique
photo. Photo files are stored without recompression or base64; only the manifest is compressed.
Existing inline photos are extracted into files too, preserving their bytes and media types.
The manifest records whether each photo should restore as a Garage URL or an inline MongoDB value.

```sh
curl --fail http://127.0.0.1:5173/api/export -o box-find-backup.zip
curl --fail-with-body http://127.0.0.1:5173/api/import \
  -H 'Content-Type: application/zip' --data-binary @box-find-backup.zip
```

Import into an empty database or one without conflicting box IDs. Imports validate the archive,
checksums, photo hashes, references, and existing box IDs before writing. Garage photos are
uploaded with their original bytes before box records are created; ZIP restores preserve box
timestamps. Missing objects make exports fail instead of creating incomplete backups.

Legacy imports still accept `Content-Type: application/json` with `{ "importObj": [...] }`.
Inline photos remain supported. A legacy JSON export containing Garage URLs is usable only
when those objects already exist in the destination; otherwise import rejects it with an error.

Backups are limited to 50,000,000 bytes for the ZIP and its expanded entries, 5,000,000 bytes for
the manifest, 10 MiB per photo, 10,000 ZIP entries, and 10,000 boxes. Restored inline references
are also limited to 50,000,000 bytes including metadata. For larger inventories, back up MongoDB
and both Garage volumes together. Keep the deployment request body limit at least 50,000,000 bytes.

Exports finish a temporary ZIP before sending the download; imports spool the request to a
temporary ZIP. Both read photo files one at a time, and temporary files are removed after use
or failure. Allow up to 50 MB of temporary disk per active backup operation. Box records and
manifest metadata remain in memory. No image processing runs during export or restore.

MongoDB and Garage do not share a transaction. A failed upload leaves no new box records but
may leave unreferenced objects. If a database insert fails after earlier inserts completed,
the error response lists those box IDs in `imported`; remove those records or omit them from
the retry. Imports never overwrite existing boxes.

`bun test` covers ZIP round trips, deduplication, validation, limits, and legacy JSON. To run
the HTTP integration test, point `BACKUP_TEST_URL` at a disposable app with an empty database
and a disposable Garage instance, and provide matching `PHOTO_ENDPOINT`, `PHOTO_ACCESS_KEY`,
and `PHOTO_SECRET_KEY` values (local development defaults are used when omitted):

```sh
BACKUP_TEST_URL=http://127.0.0.1:5174 bun test tests/backups.integration.test.js
```

The integration test creates and removes test boxes and deletes its test photo object before
restoring the ZIP. It must run against isolated services.

## Deployment

Locally hosted on a node server in Docker alongside mongoDB (see `docker-compose.yaml`).

### Demo mode

Set `ENVIRONMENT=DEMO` to make the application browse-only. In demo mode, the UI displays a notice and editing actions explain that changes are restricted. The server also rejects every non-read-only `/api/` request with `403`, so direct API calls cannot change data.

To enable it with Docker Compose, uncomment the `ENVIRONMENT=DEMO` entry in `docker-compose.yaml`. The default deployment allows changes.

## API Routes

`/api/`

- export
  - download a portable ZIP containing all boxes and their photo bytes
- import
  - restore a ZIP request body (`application/zip`), or a legacy JSON `{ importObj }` body
- deleteBox
  - delete the specified box from DB
  - json body:
    - `{ id }`
- delImage
  - delete the specified image from the specified box ID
  - json body:
    - `{ id, base64 }`
- newBox
  - create new objects in the DB with specified box ID
  - json body:
    - `{ id }`
- rawData
  - get raw JSON from entire DB
  - json body:
    - `{  }`
- renameBox
  - rename box from `id` to `editBoxName` while keeping assosiated data
  - json body:
    - `{ id, editBoxName}`
- saveContent
  - save `contents` as the contents of specified box ID
  - json body:
    - `{ id, contents }`
- saveImage
  - process and upload `base64` to Garage, then add its photo URL to the box
  - json body:
    - `{ id, base64 }`
- search
  - paths `/1` and `/2` use different image fetching methods which may improve performance in some cases
  - search for boxes with IDs or contents that match `?query`
  - URL query param: `query`
