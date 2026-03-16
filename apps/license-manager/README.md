# License Manager

Local-only owner utility for issuing and managing signed licenses for the `دكانتي Shop` accounting system.

Arabic quick guide:

- [OWNER-GUIDE.ar.md](/C:/Users/hp/Desktop/paint-shop-accounting-system-main/apps/license-manager/OWNER-GUIDE.ar.md)

## Start In Development

From the monorepo root:

```powershell
npm run dev:license-manager
```

This starts:

- the local API on `http://localhost:4174`
- the Vite UI on `http://localhost:5174`

## MVP Workflow

1. Open the `Keys` screen.
2. Generate a new key pair, or import the existing PEM files you already use.
3. Copy the public key `.env` snippet and place it in the main API configuration:

```env
LICENSE_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----
LICENSE_ENFORCEMENT=strict
```

4. Open `Issue License`.
5. Fill in customer details, plan, expiration, modules, and notes.
6. Click `Issue License`.
7. Copy or export the final `PSL1.<payload>.<signature>` token.

## Renew Or Reissue

- Open `Issued Licenses`
- Select a record
- Use `Renew` to create a new issuance with a new suggested license ID
- Use `Reissue` to create a new issuance event while keeping the original history visible

## Validate A Token

Use the `Validate License` screen to:

- decode the token payload
- verify the signature with the active public key
- inspect expiration or grace status

## Local Storage

By default the manager stores its SQLite registry and key files under the current user's local application data directory:

- database: `%APPDATA%\dukanti-license-manager\data\license-manager.db`
- keys: `%APPDATA%\dukanti-license-manager\keys\`

You can override the key storage path from the `Settings` screen.

## Security Rules

- Keep the private key on the owner machine only.
- Do not commit generated `.pem` files to the repository.
- Do not send the private key to customers.
- Customers should receive only the final signed license token.
