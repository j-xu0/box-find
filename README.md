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
  - process and upload `base64` to Garage, then add its photo URL to the box
  - json body:
    - `{ id, base64 }`
- search
  - paths `/1` and `/2` use different image fetching methods which may improve performance in some cases
  - search for boxes with IDs or contents that match `?query`
  - URL query param: `query`
