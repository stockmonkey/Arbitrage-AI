# Build ArbitrageAI on your Galaxy S23 (no Mac required)

**What you need:** Internet access; a GitHub account; the Android source ZIP; and optionally the Termux terminal app. You do **not** need Android Studio or a laptop. GitHub runs the Android compiler on a cloud runner; your phone handles the upload and installation.

**Important:** This is a build recipe, not a prebuilt APK. The workflow was checked as source code and the simulator tests were run, but an actual GitHub-runner APK build and device install have **not** been verified here.

## Route A — GitHub Codespaces using only Chrome (no terminal app installation)

1. Download `ArbitrageAI-Android-v0.5.1-PhoneBuild.zip` onto your phone from the provided ChatGPT download link.
2. Sign in to [github.com](https://github.com/) in Chrome. Create a **new private repository** called `arbitrageai-android`, selecting *Add a README file* so the default branch exists.
3. On the repository page open **Code → Codespaces → Create codespace on main**. Chrome's **Desktop site** mode may make the controls easier to reach. GitHub availability and Codespaces quotas depend on your account.
4. In the browser-based VS Code file explorer, use the explorer's **Upload...** command to upload the ZIP from the phone's Downloads folder into the repository root. Some mobile browser/file picker combinations cannot upload through the Codespaces UI; in that case use Route B (Termux).
5. Open the Codespaces terminal and run:

   ```bash
   unzip -q ArbitrageAI-Android-v0.5.1-PhoneBuild.zip
   cp -a ArbitrageAI-Android/. .
   rm -rf ArbitrageAI-Android ArbitrageAI-Android-v0.5.1-PhoneBuild.zip
   git add .
   git commit -m "Add Android application and automatic APK builder"
   git push
   ```

   If Git asks for your identity, configure it with your actual GitHub account display name and email. Don't put API keys or financial credentials in the repository.
6. Go back to your repository page, open **Actions → Build ArbitrageAI APK**, and select the completed run. The `push` normally starts it automatically. If not, use **Run workflow**.
7. In **Artifacts**, tap **ArbitrageAI-debug-APK**. GitHub typically downloads the artifact as a ZIP. Extract it with Samsung **My Files** to find `app-debug.apk`.
8. Tap `app-debug.apk` and approve installation from the chosen file manager for that installation only. Keep Play Protect enabled. Open **ArbitrageAI** from your app drawer.

## Route B — Termux from your phone (no Codespaces needed)

1. Install the official [Termux](https://github.com/termux/termux-app) from a trusted current release source (e.g. F-Droid). Avoid unofficial APK mirrors.
2. Download the project ZIP into Samsung's Downloads folder.
3. Open Termux and run:

   ```bash
   pkg update
   pkg install git gh unzip
   termux-setup-storage
   mkdir -p ~/arbitrage-source
   cd ~/arbitrage-source
   unzip -q /sdcard/Download/ArbitrageAI-Android-v0.5.1-PhoneBuild.zip
   cd ArbitrageAI-Android
   git init -b main
   git add .
   git -c user.name="ArbitrageAI Builder" -c user.email="builder@example.invalid" commit -m "Initial Android build"
   gh auth login -w
   gh repo create arbitrageai-android --private --source=. --remote=origin --push
   ```

   The fake email in the one-time commit is a placeholder; replace with a GitHub noreply email if you prefer proper authorship. Authenticate to GitHub through the web-browser flow; do not paste credentials into chat. If `gh` asks for workflow-related authorization, follow its prompts or use `gh auth refresh -h github.com -s workflow`.
4. Open your new repository in Chrome on your phone. Go to **Actions → Build ArbitrageAI APK**, select the run, and download the artifact as described in Route A steps 6–8.

## Notes

- It is normal that the GitHub artifact contains **a ZIP wrapping the APK**. Unzip before installing.
- If your S23 blocks the installation, review the current Samsung **Install unknown apps** and **Auto Blocker** protections. Do not globally disable device security; only allow a trusted APK if you understand its origin.
- This app is still an **on-device synthetic paper simulator**. It does not place real trades. Live-reference Twelve Data prices do not drive the synthetic arbitrage decisions.
- Debug APK signatures are for local testing. For distribution or Play Store releases, generate your own controlled release signing key, keep it secret and maintain backups.
- GitHub Codespaces may have usage limits; GitHub Actions may require available minutes depending on the repository and account.
