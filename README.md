# Box Find

A SvelteKit-based box storage organizer using shadcn-svelte, Tailwind CSS, sharp, fuzzbunny, and MongoDB.

## Development

Requires Bun, Docker with Docker Compose, GNU Make, and Linux `setsid` (from util-linux).

```sh
make start
```

This installs locked dependencies, starts local MongoDB through `compose.dev.yaml`, waits for
MongoDB to become healthy, and starts the Bun/Vite dev server in the background with hot reload
at http://127.0.0.1:5173. Use `make logs` to follow app output.

```sh
make stop
```

This stops the managed Bun process and removes the dev containers/network. MongoDB data stays
in the `box-find-dev_mongodb-data` Docker volume and is reused on the next start. Running
`make start` again while the app is running does not launch another app process.

Dev MongoDB is available at `mongodb://127.0.0.1:27018/boxes-dev`. `make start` sets this URI
for the app even if your `.env` contains a remote `MONGO_URI`; it does not edit `.env`.
The database starts empty, uses no authentication, and is exposed only on localhost.
Other `.env` settings still apply, including `ENVIRONMENT=DEMO` if configured.

To inspect Mongo logs, run `docker compose -f compose.dev.yaml logs -f mongodb`.
To **delete all local dev data**, stop the app and explicitly run
`docker compose -f compose.dev.yaml down --volumes`.

The dev setup is separate from the deployment Compose file below. Photos continue to be stored
in MongoDB; Garage/S3 integration is a future change.

## Deployment

Locally hosted on a node server in Docker alongside mongoDB (see `docker-compose.yaml`).

### Demo mode

Set `ENVIRONMENT=DEMO` to make the application browse-only. In demo mode, the UI displays a notice and editing actions explain that changes are restricted. The server also rejects every non-read-only `/api/` request with `403`, so direct API calls cannot change data.

To enable it with Docker Compose, uncomment the `ENVIRONMENT=DEMO` entry in `docker-compose.yaml`. The default deployment allows changes.

## API Routes

`/api/`

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
  - add `base64` to array of images for specified box ID
  - json body:
    - `{ id, base64 }`
- search
  - paths `/1` and `/2` use different image fetching methods which may improve performance in some cases
  - search for boxes with IDs or contents that match `?query`
  - URL query param: `query`
