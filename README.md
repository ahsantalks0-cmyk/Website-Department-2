# AI Design Department — Desktop Application Foundation

AI Design Department is a modern desktop application foundation built on Electron, tailored to evolve into an autonomous, AI-powered website and UI generation system. Designed with an Apple-inspired minimalist aesthetic—spacious negative space, restrained typography, and a seamless dual-theme system—this Phase 1 release provides the core desktop shell, secure IPC context bridges, in-app auto-updating via GitHub Releases, and an automated continuous delivery build pipeline.

---

## Local Development

To run the application locally in development mode:

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Launch the Electron desktop shell:**
   ```bash
   npm start
   ```

> **Note for Local Web Preview:** If inspecting within a web browser or container sandbox, `npm run dev` serves the renderer UI at `http://localhost:3000`.

---

## Local Build (Packaging Without Publishing)

To build and package the standalone desktop application locally without publishing artifacts to GitHub Releases:

```bash
# Package the unpackaged application directory for local testing
npm run pack

# Or build the Windows NSIS installer locally without publishing:
npx electron-builder --win nsis --publish never
```

The output executable (`AI Design Department Setup 1.0.0.exe`) and unpackaged files will be located in the `dist/` directory.

---

## GitHub Setup (Step-by-Step)

To enable automated builds and GitHub Releases publishing via GitHub Actions:

1. **Create a GitHub Repository:**
   - Create a new repository on GitHub (e.g. `your-username/ai-design-department`).
   - Push this codebase to the `main` branch.

2. **Configure GitHub Actions Permissions (Fastest Fix):**
   - In your GitHub repository:
     1. Click **Settings** (top tabs of the repository).
     2. In the left sidebar, go to **Actions** → **General**.
     3. Scroll down to **Workflow permissions**.
     4. Select **Read and write permissions**.
     5. Check **Allow GitHub Actions to create and approve pull requests** (if available).
     6. Click **Save**.
   - With this enabled, GitHub Actions automatically provides write permissions to publish releases without requiring a manual token!

3. **Or Add a `GH_TOKEN` Repository Secret (Alternative / Recommended for PATs):**
   - Go to your GitHub profile: **Settings** → **Developer Settings** → **Personal Access Tokens** → **Tokens (classic)**.
   - Click **Generate new token (classic)**.
   - Give it a name (e.g. `Release Publisher`) and tick the **`repo`** scope.
   - Copy the generated token string.
   - In your repository, go to **Settings** → **Secrets and variables** → **Actions**.
   - Click **New repository secret**.
   - Name: `GH_TOKEN`
   - Value: Paste the token.
   - Click **Add secret**.

---

## Release Flow

```
Push commit to 'main' branch
        │
        ▼
GitHub Actions triggers on windows-latest (.github/workflows/build.yml)
        │
        ▼
Version Conflict Handler checks if release tag (e.g. v1.0.0) exists
   ├── If exists: automatically bumps patch version (1.0.1) & commits
   └── If unique: proceeds with current version
        │
        ▼
electron-builder packages NSIS Windows installer
        │
        ▼
Creates GitHub Release with .exe and latest.yml metadata published
```

Every push to `main` executes the Windows CI/CD pipeline, guaranteeing unique release tags and instant delivery of installer binaries.

---

## Update Flow

1. **Initial Installation:** The user downloads and installs the Windows installer (`.exe`) once from your GitHub Releases page.
2. **Background Detection:** Whenever the application launches, it silently contacts the GitHub Releases API in the background using `latest.yml`.
3. **Notification:** When an update is detected, a notification badge illuminates in the sidebar and top bar ("Update Available").
4. **User-Controlled Download:** The user visits **Settings** → **Updates**, views release notes, and clicks **Download Update**. A real-time progress bar reflects transfer speed (MB/s) and transferred bytes.
5. **Seamless Installation:** Upon completion, the user clicks **Restart & Install**. Electron invokes `autoUpdater.quitAndInstall()`, gracefully swapping the binary and relaunching the updated version.

---

## Phase 2: Local SQLite Database Layer

AI Design Department features a local, zero-latency SQLite database powered by `better-sqlite3`. The database initializes automatically on application boot before the primary window is created, executing versioned migrations sequentially in atomic transactions.

### Storage Location
To ensure every distributed user gets their own isolated local database on their own machine, the database file is stored in Electron's `userData` directory:

- **Windows:** `%APPDATA%\aidepartment\aidepartment.db`
- **macOS:** `~/Library/Application Support/aidepartment/aidepartment.db`
- **Linux:** `~/.config/aidepartment/aidepartment.db`

### Engine Configuration
- **Journal Mode:** Write-Ahead Logging (`PRAGMA journal_mode = WAL;`) for high-concurrency non-blocking reads.
- **Foreign Keys:** Enabled (`PRAGMA foreign_keys = ON;`) to guarantee referential integrity and cascading deletes across projects, pages, variety seeds, and design tokens.
- **IPC Isolation:** All database access is strictly encapsulated in the Electron main process via prepared statements and exposed through the secure `window.api.db` context bridge.

### Database Reset Instructions
If you ever need to reset the local database to a clean state:
1. Close the application.
2. Navigate to your operating system's `userData` path listed above.
3. Delete the file `aidepartment.db` (as well as any `aidepartment.db-wal` or `aidepartment.db-shm` files if present).
4. Relaunch the application. The migration runner will automatically rebuild the schema and indices on boot.

---

## Important Note

> ⚠️ **Auto-Updater Runtime Constraint:**
> The `electron-updater` module requires a packaged application environment (such as an installed `.exe`) to interact with release channels and download update diffs. In local development mode (`npm start`), the auto-updater safely bypasses remote queries and outputs status notices to prevent developer interruption. The in-app Settings UI provides an integrated simulation mode for validating the updater interface during development.
