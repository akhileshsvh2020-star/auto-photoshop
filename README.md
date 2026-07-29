# Auto Photoshop Studio

Auto Photoshop Studio is a hosted UI plus Electron desktop connector for automating Photoshop on the user's own computer.

## How It Works

- The website can be deployed to GitHub/Vercel.
- The computer that has Photoshop installed runs the Auto Photoshop Connector desktop app.
- The browser asks the bridge for permission.
- After approval, prompts from the website are sent to `http://127.0.0.1:4765`.
- The bridge sends JSX automation to Photoshop and exports the design to the project `outputs` folder by default.

The hosted website cannot directly control Photoshop by itself. Browser security requires a local app/bridge on each Photoshop device.

## Run Locally

```bash
npm start
```

Open:

```text
http://127.0.0.1:4765
```

## Run The Electron Connector

Install dependencies:

```bash
npm install
```

Start the desktop connector:

```bash
npm run electron
```

Build a Windows installer:

```bash
npm run dist
```

The installer will be created in the `release` folder. Upload that `.exe` somewhere your Vercel website can link to, then update the download URL in `public/index.html`.

## Use From Vercel

Deploy the `public` folder as a static site or deploy this repo normally. On the Photoshop computer, install and open Auto Photoshop Connector.

For a custom production domain, start/package the connector with the allowed Vercel origin:

```bash
ALLOWED_ORIGIN=https://your-vercel-domain.vercel.app npm start
```

Then open the Vercel website on that same Photoshop computer, click **Allow this device**, enter a prompt and size, and create the design.

For Electron packaging, set the production origin in the app environment or bake it into `server.js` before building the installer.

## Login Accounts

Login is checked server-side through `/api/login`. Do not put real passwords in frontend files.

Local accounts are stored as password hashes in:

```text
auth-users.json
auth-users.backup.json
```

If `auth-users.json` is deleted or damaged, the login server automatically falls back to `auth-users.backup.json`.

Generate a hashed account entry:

```bash
node scripts/hash-password.js user@example.com user-password
```

For Vercel, you can also set `AUTO_PHOTOSHOP_USERS` as a JSON array:

```json
[
  {
    "email": "user@example.com",
    "salt": "generated-salt",
    "hash": "generated-hash"
  }
]
```

The local demo account is:

```text
demo@autophotoshop.local / demo123
```

## Size Examples

- `12x12`
- `8.5x11`
- `4x6`
- `A4`
- `story`
- `poster`
- `thumbnail`

Sizes are entered in inches and converted to pixels at 300 pixels/inch for Photoshop.

## Notes

- This MVP uses Photoshop's Windows COM automation and JSX scripting.
- Photoshop must be installed on the computer running the bridge.
- The first Photoshop launch can be slower than later runs.
- To change the export folder, start the bridge with `AUTO_PHOTOSHOP_OUTPUT_DIR=C:\path\to\exports node server.js`.
- For a public business product, package the bridge as an installer and add signed builds, stricter origin checks, and per-customer auth.
