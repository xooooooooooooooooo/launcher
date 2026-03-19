# Supabase Encrypted Payload Endpoints

This repo’s launcher backend can download an encrypted DLL payload (client + dependencies) from Supabase **Edge Functions** + **Storage**, decrypt it locally into a random temp folder, inject it using the existing `LoadLibraryW` flow, then delete the temp folder.

## Storage layout
- **Bucket**: `payloads` (recommended: **private**)
- **Objects** (encrypted bytes, not plaintext DLLs):
  - `client.dll.enc`
  - `MinHook.x64.dll.enc` (and any other dependency DLLs required by `client.dll`)

## Edge Functions (HTTP endpoints)
All functions live under:
- `https://<project-ref>.supabase.co/functions/v1`

All endpoints should require a valid Supabase user access token:
- Header: `Authorization: Bearer <access_token>`

### 1) Manifest
- **GET**: `/payload-manifest`
- **Response**:

```json
{
  "version": "10.0.2",
  "files": [
    { "id": "client", "name": "client.dll" },
    { "id": "minhook", "name": "MinHook.x64.dll" }
  ]
}
```

Notes:
- `id` is used to request the encrypted bytes from `payload-file`.
- `name` is the filename written into the temp folder (must match dependency names expected by Windows loader).

### 2) Key (server-issued)
- **POST**: `/payload-key`
- **Response**:

```json
{
  "key_b64": "<base64 AES-256 key>",
  "expires_in_sec": 30
}
```

### 3) Encrypted file bytes
- **GET**: `/payload-file?id=<id>`
- **Response**: `application/octet-stream` raw bytes of the encrypted blob.

## Encryption format (required)
Algorithm: **AES-256-GCM**.

Encrypted blob byte layout:
- first 12 bytes: **nonce**
- next N bytes: **ciphertext**
- last 16 bytes: **tag**

The launcher backend expects this exact layout.

## Runtime behavior (launcher backend)
- Downloads manifest
- Requests key
- Downloads each encrypted file
- Decrypts each to plaintext bytes
- Writes all plaintext DLLs to a fresh random folder under `%TEMP%`:
  - `%TEMP%\\hades-payload-<guid>\\client.dll`
  - `%TEMP%\\hades-payload-<guid>\\MinHook.x64.dll`
  - ...
- Injects `client.dll` by path
- Best-effort wipes + deletes the temp folder immediately after

