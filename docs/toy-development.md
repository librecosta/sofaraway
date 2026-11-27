# Bilibili Toy development

Use Node 24 and run `npm ci` from the repository root. The Toy entry shares the Web player's game code. Its distribution is `cn / bilibili / zh-CN` by default and it keeps its own settings and records. Both languages are available in Settings.

| Task | Command | Output or address |
| --- | --- | --- |
| Develop with HMR | `npm run dev:toy` | [Toy Dev Console](http://127.0.0.1:5174/) |
| Build Toy Release | `npm run build:toy` | `build/toy/` |
| Preview the release build | `npm run preview:toy` | [Nested player entry](http://127.0.0.1:4174/toy/sofaraway/index.html) |
| Build and package for upload | `npm run package:toy` | `build/packages/sofaraway-toy.zip` |
| Run focused browser checks | `npm run test:toy` | `test-results/toy/` |

Stop either interactive server with Ctrl+C in its terminal. The tests start and stop their own servers and build the release first. Install Chromium with `npx playwright install chromium`, or set `TOY_CHROMIUM_CHANNEL=chrome` to use installed Chrome. Set environment variables with `$env:TOY_CHROMIUM_CHANNEL = 'chrome'` in PowerShell.

The Dev Console runs offline and exercises the container contract through the Mock Adapter. Use the Desktop, Android and iOS presets to change the iframe's real CSS viewport, set the safe-area insets and toggle simulated immersion. The **SDK unavailable** switch returns the frame to browser defaults. **Reset simulation** resets the container controls. The same player canvas stays mounted as you change these values. The host browser still provides actual touch, WebGL, audio and fullscreen capabilities. Dev Console presets are in memory, and the Dev player's saved settings and records use a separate `.dev` namespace.

Preview serves exactly `build/toy/` with real static 404s. To simulate another mount, run `node tools/serve-static.mjs build/toy 4174 /your/nested/path/` and open `/your/nested/path/index.html`. Web builds may clean the shared `build/` directory, so run Toy packaging after the Web builds when preparing all three artifacts.

## Official preflight

T0 cached the verified CLI, Agent Skill and Doctor under the ignored `.local/t0-toy/`. The checked Windows CLI is `v0.6.6` (`c760fd2`). On a clean machine, use the [official CLI installation guide](https://github.com/bilibili/toy/blob/f418536cc463ad598a775bc1ad6cfb0505905ab7/skills/toy/references/installation.md) and the [official Agent Skill](https://github.com/bilibili/toy/blob/f418536cc463ad598a775bc1ad6cfb0505905ab7/skills/toy/SKILL.md). Keep local tools in an ignored directory or on your user PATH.

```sh
toy version
toy --help-json --json
npm run package:toy
python .local/t0-toy/toy_doctor.py build/packages/sofaraway-toy.zip --slug sofaraway --json
```

On Windows, use `.local/t0-toy/toy.exe` in place of `toy` if using the cached binary. If the Doctor is missing, save the [pinned official script](https://raw.githubusercontent.com/bilibili/toy/f418536cc463ad598a775bc1ad6cfb0505905ab7/skills/toy/scripts/toy_doctor.py) as `.local/t0-toy/toy_doctor.py`. Use `python3` where Python is installed under that command. These checks can run without a Bilibili account.

## Hosted preview

When the publisher authorizes an upload, use `toy login` with the creator account that has Toy permissions. Run `toy create --help-json --json` or `toy update --help-json --json` first, since the accepted arguments depend on the installed CLI. In the verified CLI, `toy create build/packages/sofaraway-toy.zip --slug sofaraway --visibility link-only --json` creates a preview upload for a new Toy, and `toy update <id> build/packages/sofaraway-toy.zip --json` previews a package for an existing Toy. Both commands upload the ZIP. Keep `--yes` out of preview commands, since it submits for review. Supply publisher-approved metadata and any required poster or icon according to the current CLI help.

Open the returned `preview_url` in a browser and on physical Android and iOS Bilibili clients. Verify launch from the hosted path, WebGL and audio recovery, rotation, safe areas, immersion and local persistence across reopen. Before any future SDK integration, verify creator-preview service permissions and the separation of preview and live records. Use test accounts and isolated data for service checks. Keep simulated scores out of the live player leaderboard. [T0 platform compatibility audit](audits/T0-toy-platform-compatibility.md)
